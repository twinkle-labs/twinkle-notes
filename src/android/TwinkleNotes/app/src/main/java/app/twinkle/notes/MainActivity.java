/*    
 * Copyright (C) 2020, Twinkle Labs, LLC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

package app.twinkle.notes;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.provider.MediaStore;

import androidx.core.app.ActivityCompat;

import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.*;
import android.widget.Toast;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.GooglePlayServicesUtil;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.firebase.iid.*;

import org.json.JSONObject;


import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final int BARCODE_READER_REQUEST_CODE = 1;
    private static final int VIDEO_CAPTURE_REQUEST_CODE = 2;
    private static final int IMAGE_CAPTURE_REQUEST_CODE = 3;
    private static final int FILECHOOSER_RESULTCODE = 4;
    private static final int REQUEST_SELECT_FILE = 5;
    private static final int REQUEST_PERMISSION_RECORD_VIDEO = 100;
    private static final int REQUEST_PERMISSION_DOWNLOAD = 101;
    private String deviceToken = null;
    private String deviceType = null;
    private WebView mWebView;
    private File distPath;
    private File varPath;
    private DownloadManager.Request _currentDownloadRequest = null;

    private void ensureDataDirectoryExists() {
        ContextWrapper cw = new ContextWrapper(this);
        File dataPath = cw.getFilesDir();
        if (!dataPath.exists()) {
            dataPath.mkdirs();
        }
        distPath = new File(dataPath + "/dist");
        varPath = new File(dataPath + "/var");
        if (!distPath.exists()) distPath.mkdir();
        if (!varPath.exists()) varPath.mkdir();
        copyAssets();
    }

    /**
     * Copy files from the folder "assets/dist.zip"
     */
    private void copyAssets() {
        Decompress.unzipFromAssets(this, "dist.zip", distPath.getPath());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        ensureDataDirectoryExists();

        final TwinkleSystem twkSys = new TwinkleSystem();
        twkSys.setDistPath(distPath.getPath());
        twkSys.setVarPath(varPath.getPath());
        //twkSys.startLogger();
        final Handler handler = new Handler();
        twkSys.start();

        mWebView = (WebView) findViewById(R.id.activity_main_webview);
        initWebView();

        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean active = false;
                while (true) {
                    String msg = twkSys.getMessage();
                    Log.i("twk", msg);
                    if (!active) {
                        if (msg.startsWith("(httpd-started")) {
                            String s = msg.substring(msg.indexOf(' ')+1, msg.indexOf(')'));
                            final int port = Integer.parseInt(s);
                            runOnUiThread(new Runnable() {
                                public void run() {
                                    mWebView.loadUrl("http://127.0.0.1:"+port+"/main.html");
                                    if (getIntent() != null) {
                                        // Allow a long wait for the webapp to be ready
                                        new Handler().postDelayed(new Runnable() {
                                            @Override
                                            public void run() {
                                                processExtraData();
                                            }
                                        }, 3000);
                                    }
                                }
                            });
                            active = true;
                        }
                    } else {
                        if (msg.startsWith("(httpd-failed")) {
                            runOnUiThread(new Runnable() {
                                public void run() {
                                    mWebView.loadUrl("about:blank");
                                }
                            });
                            active = false;
                        }
                    }
                }
            }
        }).start();

        setupFCM();
    }

    private boolean checkPlayServices() {
        GoogleApiAvailability apiAvailability = GoogleApiAvailability.getInstance();
        int resultCode = apiAvailability.isGooglePlayServicesAvailable(this);
        if (resultCode != ConnectionResult.SUCCESS) {
            return false;
        }
        return true;
    }


    private void setupFCM() {
        if (checkPlayServices()) {
            FirebaseInstanceId.getInstance().getInstanceId()
                    .addOnCompleteListener(new OnCompleteListener<InstanceIdResult>() {
                        @Override
                        public void onComplete(Task<InstanceIdResult> task) {
                            if (!task.isSuccessful()) {
                                Log.w("FCM", "getInstanceId failed", task.getException());
                                return;
                            }

                            // Get new Instance ID token
                            deviceToken = task.getResult().getToken();
                            deviceType = "android";
                            mWebView.evaluateJavascript("app.setDeviceInfo('" + deviceToken + "','android');",
                                    null);

                            // Log and toast
                            String msg = "Got Token:" + deviceToken;
                            Log.d("FCM", msg);
                        }
                    });
        } else {
            Log.i("Main", "Google Play on this device is not supported.");
        }
    }


    private boolean isGranted(String permission) {
        return ActivityCompat.checkSelfPermission(this, permission)
                == PackageManager.PERMISSION_GRANTED;
    }

    private void requestPermission(String permission, int requestCode)
    {
        if (!isGranted(permission)) {
            ActivityCompat.requestPermissions(this, new String[]{permission}, 500);
        }
    }

    private boolean requestPermissionsIfNecessary(String permissions[], int requestCode) {
        boolean needRequest = false;
        for (int i = 0; i < permissions.length; i++) {
            if (!isGranted(permissions[i])) {
                needRequest = true;
                break;
            }
        }
        if (needRequest) {
            ActivityCompat.requestPermissions(this, permissions, requestCode);
        }
        return needRequest;
    }

   // @Override
    public void onRequestPermissionsResult(int requestCode, String permissions[], int[] grantResults) {
        boolean isGranted = true;
        for (int i = 0; i < permissions.length; i++) {
            if (i < grantResults.length && grantResults[i] == PackageManager.PERMISSION_GRANTED) {
                ;
            } else {
                isGranted = false;
                break;
            }
        }
        switch (requestCode) {
            case REQUEST_PERMISSION_RECORD_VIDEO: {
                if (isGranted) {
                    doRecordVideo();
                }
                return;
            }
            case REQUEST_PERMISSION_DOWNLOAD: {
                if (isGranted) {
                    doDownload();
                } else {
                    _currentDownloadRequest = null;
                }
                return;
            }
            default:
                break;
        }
    }

    private ValueCallback<Uri[]> fileChooserCallback;

    // https://www.opengeeks.me/2015/08/filechooser-and-android-webview/
    // https://stackoverflow.com/questions/23568792/android-4-4-webview-file-chooser-not-opening
    public class TwinkleWebChromeClient extends WebChromeClient {
        // For Lollipop 5.0+ Devices
        public boolean onShowFileChooser(
                WebView mWebView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            if (fileChooserCallback != null) {
                fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = null;
            }

            fileChooserCallback = filePathCallback;
            Intent intent = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                intent = fileChooserParams.createIntent();
            }

//            Intent contentSelectionIntent = new Intent(Intent.ACTION_GET_CONTENT);
//            contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
//            contentSelectionIntent.setType("*/*");

            try {
                startActivityForResult(intent, REQUEST_SELECT_FILE);
            } catch (ActivityNotFoundException e) {
                fileChooserCallback = null;
                Toast.makeText(getApplicationContext(), "Cannot Open File Chooser", Toast.LENGTH_LONG).show();
                return false;
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {

            Log.d("LogTag", message);
            result.confirm();
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin,
                                                       GeolocationPermissions.Callback callback) {

            callback.invoke(origin, true, false);
        }
    }

    private void initWebView()
    {
        WebSettings settings = mWebView.getSettings();
        settings.setGeolocationEnabled(true);

        // Force links and redirects to open in the WebView instead of in a browser
        //mWebView.setWebViewClient(new WebViewClient());

        // Stop local links and redirects from opening in browser instead of WebView
         mWebView.setWebViewClient(new WebViewClient() {
             @Override
             public void onPageFinished(WebView view, String url) {
                 if (deviceToken != null) {
                     view.evaluateJavascript("app.setDeviceInfo('" + deviceToken + "','android');",
                             null);
                 }
             }

             @Override
             public boolean shouldOverrideUrlLoading(WebView view, String url) {
                 // We should open external URLs in a real browser
                 if (Uri.parse(url).getHost().endsWith("127.0.0.1")) {
                     return false;
                 }

                 Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                 view.getContext().startActivity(intent);
                 return true;
             }
         });

        //mWebView.clearCache(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Enable Javascript
        mWebView.getSettings().setJavaScriptEnabled(true);

        mWebView.getSettings().setDomStorageEnabled(true);
        mWebView.getSettings().setDatabaseEnabled(true);

        // Enable App Cache
        // This next one is crazy. It's the DEFAULT location for your app's cache
        // But it didn't work for me without this line.
        // UPDATE: no hardcoded path. Thanks to Kevin Hawkins
        String appCachePath = getApplicationContext().getCacheDir().getAbsolutePath();
        mWebView.getSettings().setAppCachePath(appCachePath);
        mWebView.getSettings().setAppCacheEnabled(true);

        mWebView.getSettings().setAllowFileAccess(true);
        // Allow access to other file urls
        mWebView.getSettings().setAllowFileAccessFromFileURLs(true);
        mWebView.getSettings().setAllowUniversalAccessFromFileURLs(true);

        mWebView.addJavascriptInterface(this, "AppHost");

        mWebView.setWebChromeClient(new TwinkleWebChromeClient());

        mWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent,
                                        String contentDisposition, String mimeType,
                                        long contentLength) {
                Uri uri = Uri.parse(url);
                String filename = uri.getQueryParameter("name");
                if (filename == null) {
                    filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                }
                _currentDownloadRequest = new DownloadManager.Request(
                        Uri.parse(url));
                if (mimeType != null
                        && (mimeType.startsWith("image/") ||
                            mimeType.startsWith("audio/") ||
                            mimeType.startsWith("video/")))
                {
                    _currentDownloadRequest.allowScanningByMediaScanner();
                }
                _currentDownloadRequest.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                _currentDownloadRequest.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS,
                        filename);
                if (!requestPermissionsIfNecessary(new String[]{
                        Manifest.permission.WRITE_EXTERNAL_STORAGE
                }, REQUEST_PERMISSION_DOWNLOAD)) {
                    doDownload();
                }
            }
        });

        // We want to have a Dark sky theme
        // Setting background in layout xml doesn't work.
        mWebView.setBackgroundColor(0);
    }

    private void doDownload() {
        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        dm.enqueue(_currentDownloadRequest);
        Toast.makeText(getApplicationContext(),
                "Saving file to Downloads",
                Toast.LENGTH_LONG).show();
    }

    // Prevent the back-button from closing the app
   @Override
    public void onBackPressed() {
       moveTaskToBack(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        // Handle action bar item clicks here. The action bar will
        // automatically handle clicks on the Home/Up button, so long
        // as you specify a parent activity in AndroidManifest.xml.
        int id = item.getItemId();

        //noinspection SimplifiableIfStatement
        if (id == R.id.action_settings) {
            return true;
        }

        return super.onOptionsItemSelected(item);
    }


    /** Show a toast from the web page */
    @JavascriptInterface
    public void showToast(String toast) {
        Toast.makeText(this, toast, Toast.LENGTH_SHORT).show();
    }

    @JavascriptInterface
    public void scanQRCode() {
        Log.i("AppHost", "scanQRCode");

       // Intent intent = new Intent(getApplicationContext(), BarcodeCaptureActivity.class);
    //    Intent intent = new Intent(getApplicationContext(), SimpleScannerActivity.class);
      //  startActivityForResult(intent, BARCODE_READER_REQUEST_CODE);

    }

    private String uploadUrl;
    private String uploadToken;
    private String uploadId;

    @JavascriptInterface
    public void playVideo(String url) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setDataAndType(Uri.parse(url), "video/mp4");
        startActivity(intent);
    }

    @JavascriptInterface
    public void recordVideo(String url, String accessToken, String sampleId) {
        uploadUrl = url;
        uploadToken = accessToken;
        uploadId = sampleId;
        if (!requestPermissionsIfNecessary(new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.READ_EXTERNAL_STORAGE
        }, REQUEST_PERMISSION_RECORD_VIDEO)) {
            doRecordVideo();
        }
    }

    private void doRecordVideo() {
        if (true) {
            Log.i("AppHost", "recordVideo");
            Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60);//60 seconds
            intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0);//low quality
            intent.putExtra(MediaStore.EXTRA_SIZE_LIMIT, 30*1024*1024L);
            intent.putExtra(MediaStore.EXTRA_FINISH_ON_COMPLETION, true);
            startActivityForResult(intent, VIDEO_CAPTURE_REQUEST_CODE);
        } else {
            Log.i("AppHost", "recordImage");
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            startActivityForResult(intent, IMAGE_CAPTURE_REQUEST_CODE);
        }
    }


    private static String getRealFilePath(final Context context, final Uri uri) {
        if (uri == null) return null;
        final String scheme = uri.getScheme();
        String data = null;
        if (scheme == null) {
            data = uri.getPath();
        } else if (ContentResolver.SCHEME_FILE.equals(scheme)) {
            data = uri.getPath();
        } else if (ContentResolver.SCHEME_CONTENT.equals(scheme)) {
            Cursor cursor = context.getContentResolver().query(uri, new String[]{
                    MediaStore.Images.ImageColumns.DATA,
                    MediaStore.Video.VideoColumns.DATA
            }, null, null, null);
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    int index = cursor.getColumnIndex(MediaStore.Images.ImageColumns.DATA);
                    if (index < 0)
                        index = cursor.getColumnIndex(MediaStore.Video.VideoColumns.DATA);
                    if (index > -1) {
                        data = cursor.getString(index);
                    }
                }
                cursor.close();
            }
        }
        return data;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent intent) {
        if (requestCode == REQUEST_SELECT_FILE) {
            Toast.makeText(this, "Select file:"+resultCode, Toast.LENGTH_LONG);
            if (fileChooserCallback == null)
                return;
            if(resultCode== Activity.RESULT_OK) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    fileChooserCallback.onReceiveValue(
                            WebChromeClient.FileChooserParams.parseResult(resultCode, intent)
                    );
                }
            } else {
                fileChooserCallback.onReceiveValue(null);
            }
            fileChooserCallback = null;
        } else if (requestCode == VIDEO_CAPTURE_REQUEST_CODE) {
            if (intent == null)
                return;
            Uri videoUri = intent.getData();
            if (videoUri == null)
                return;
            Log.i("AppHost", "video captured:" + videoUri.getPath());
            final String p = getRealFilePath(this, videoUri);
            new Thread(new Runnable() {
                @Override
                public void run() {
                    //uploadRecording(p);
                }
            }).start();
        } else if (requestCode == IMAGE_CAPTURE_REQUEST_CODE) {
            Bitmap photo = (Bitmap) intent.getExtras().get("data");
            Uri tempUri = getImageUri(getApplicationContext(), photo);
            final String p = getRealFilePath(this, tempUri);
            new Thread(new Runnable() {

                @Override
                public void run() {
                    //uploadRecording(p);
                }
            }).start();
        } else {
            super.onActivityResult(requestCode, resultCode, intent);
        }
    }


    private Uri getImageUri(Context inContext, Bitmap inImage) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        inImage.compress(Bitmap.CompressFormat.JPEG, 100, bytes);
        String path = MediaStore.Images.Media.insertImage(inContext.getContentResolver(), inImage,
                "Title", null);
        return Uri.parse(path);
    }

    private void processExtraData()
    {
        Log.i("Main", "new intent data");
        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                handleSendText(intent);
            } else {
                handleSendFile(intent);
            }
        } else {
            // Handle other intents, such as being started from the home screen
        }

    }


    private void handleSendText(Intent intent) {
        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (sharedText != null) {
            addNewNote(sharedText);
        }
    }

    private void addNewNote(String text) {
        // Update UI to reflect text being shared
        try {
            JSONObject s = new JSONObject();
            s.put("content", text);
            //Log.i("Main", "shared text=" + s.toString());
            mWebView.evaluateJavascript("app.addNewNote(" + s.toString() + ");", null);
        } catch (Exception ex) {
            ex.printStackTrace();
        }

    }

    private void uploadBlob(String path, String mimeType, String token) {
        JSONObject result = null;
        String blobPath = null;
        long size = 0;
        if (mimeType == null) {
            mimeType = "application/octect-stream";
        }
        try {
            URL url = new URL("http://127.0.0.1:6780/api/files/upload?access-token="+token);

            HttpURLConnection connection = (HttpURLConnection) url.openConnection();

            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setDoInput(true);
            connection.setUseCaches(false);

            connection.setRequestProperty("Content-Type", mimeType);
            File f = new File(path);
            size = f.length();
            connection.setRequestProperty("Content-Length", ""+size);

            // Send file content
            OutputStream output = connection.getOutputStream();
            InputStream in = new FileInputStream(path);
            byte[] buffer = new byte[1024];
            int len;
            while ((len = in.read(buffer)) != -1) {
                output.write(buffer, 0, len);
            }
            in.close();
            output.flush();
            output.close();

            InputStream inputStream = null;
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new Exception("uploadBLOB http error");
                // inputStream = connection.getErrorStream();
            } else {
                inputStream = connection.getInputStream();

            }

            BufferedReader bR = new BufferedReader(  new InputStreamReader(inputStream));
            String line = "";
            StringBuilder sb = new StringBuilder();
            while((line =  bR.readLine()) != null){
                sb.append(line);
            }
            Log.i("main", "SERVER REPLIED:" + sb.toString());

            result= new JSONObject(sb.toString());
            blobPath = result.getString("path");

            inputStream.close();

            connection.disconnect();

        } catch (Exception e) {
            Log.e("main", "uploadBlob error:" + e.getMessage());
            e.printStackTrace();
        }

        if (result != null) {
            String x = "";
            String filename = path.substring(path.lastIndexOf("/")+1);
            if (mimeType.startsWith("image/")) {
                x = "[image:" + blobPath + "]";
            } else if (mimeType.startsWith("audio/")) {
                x = "[audio:" + blobPath + "]";
            } else if (mimeType.startsWith("video/")) {
                x = "[video:" + blobPath + "]";
            } else if (mimeType.equals("application/pdf")) {
                x = "[pdfviewer:" + filename + "," + blobPath + "]";
            } else {
                x = "[file:" + blobPath + ":type="+mimeType+",size="+size+",name=" + filename + "]";
            }
            final String s = x;

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(getApplicationContext(),
                            "Import done",
                            Toast.LENGTH_SHORT).show();

                    addNewNote(s);
                }
            });
        }
    }

    public static String getMimeType(String url)
    {
        String type = null;
        if (!url.contains("."))
            return null;
        String extension = url.substring( url.lastIndexOf(".") + 1);
        if (extension != null) {
            MimeTypeMap mime = MimeTypeMap.getSingleton();
            type = mime.getMimeTypeFromExtension(extension);
        }
        return type;
    }

    private void handleSendFile(final Intent intent) {
        final Uri imageUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (imageUri != null) {
            Log.i("main", "shared image:"+imageUri);
            final String p = getRealFilePath(this, imageUri);
            mWebView.evaluateJavascript("app.getAccessToken()",new ValueCallback<String>() {
                public void onReceiveValue(String result) {
                    try {
                        JSONObject obj = new JSONObject(result);
                        final String token = obj.getString("token");

                        Toast.makeText(getApplicationContext(),
                                "Importing",
                                Toast.LENGTH_LONG).show();

                        new Thread(new Runnable() {

                            @Override
                            public void run() {
                                uploadBlob(p, getMimeType(p), token);
                            }
                        }).start();
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                }
            });
        }
    }


    protected void onNewIntent(Intent intent) {

        super.onNewIntent(intent);

        setIntent(intent);//must store the new intent unless getIntent() will return the old one

        processExtraData();

    }


}