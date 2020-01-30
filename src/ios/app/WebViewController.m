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


#import "WebViewController.h"
#import "WebViewUIDelegate.h"
#import <objc/message.h>
#import <QuickLook/QuickLook.h>

#ifdef APPSTORE
#define DEVICE_TYPE @"ios"
#else
#define DEVICE_TYPE @"ios-dev"
#endif
@interface _NoInputAccessoryView : NSObject

@end

@implementation _NoInputAccessoryView

- (id)inputAccessoryView {
    return nil;
}

@end

@interface WebViewController ()
<UIScrollViewDelegate,
 QLPreviewControllerDelegate,
 QLPreviewControllerDataSource>
{
	QLPreviewController *_previewController;
    NSString *_deviceToken;
	NSURL  *_previewURL;
	UIAlertController *_alert;
    BOOL _loaded;
}
@end

@implementation WebViewController
- (void)setDeviceToken:(NSString *)token
{
    _deviceToken = token;
    if (_loaded) {
    [self.webView evaluateJavaScript:[NSString stringWithFormat:@"app.setDeviceInfo('%@','%@')", _deviceToken, DEVICE_TYPE]
     completionHandler:nil];
     }

}
- (void)previewControllerDidDismiss:(QLPreviewController *)controller
{
	BOOL ok = [[NSFileManager defaultManager] removeItemAtURL:_previewURL error:nil];
	NSLog(@"Delete preview file:%@ %s",_previewURL, ok ? "OK" :"FAILED");
	_previewURL = nil;
}

- (void)openPreview
{
	if (_previewController == nil) {
		_previewController = [[QLPreviewController alloc] init];
		_previewController.dataSource = self;
		_previewController.delegate = self;
	}
	[self presentViewController:_previewController animated:YES completion:^{}];
}

-(UIStatusBarStyle)preferredStatusBarStyle
{
    return UIStatusBarStyleLightContent;
}

- (void) adjustView {
	[self.navigationController setNavigationBarHidden:YES];

	float ver = [[[UIDevice currentDevice] systemVersion] floatValue];
    if (ver < 11.0) {
        CGRect screen = [[UIScreen mainScreen] bounds];
        if (self.navigationController) {
            CGRect frame = self.navigationController.view.frame;
            frame.origin.y = 20;
            frame.size.height = screen.size.height - 20;
            self.navigationController.view.frame = frame;
        } else {
            if ([self respondsToSelector: @selector(containerView)]) {
                UIView *containerView = (UIView *)[self performSelector: @selector(containerView)];

                CGRect frame = containerView.frame;
                frame.origin.y = 20;
                frame.size.height = screen.size.height - 20;
                containerView.frame = frame;
            } else {
                CGRect frame = self.view.frame;
                frame.origin.y = 20;
                frame.size.height = screen.size.height - 20;
                self.view.frame = frame;
            }
        }
    }
}

// Fix the problem when keyboard appears webview will shift
// its content up. we will actually resize the webview so as to
// force viewers collapse
- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
	scrollView.contentOffset = CGPointZero;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view, typically from a nib.
    
    NSLog(@"Load %@", self.urlToLoad);
    self.view.backgroundColor = [UIColor blackColor];
    CGRect webViewBounds = self.view.bounds;
    webViewBounds.origin = self.view.bounds.origin;
	
    WKUserContentController* userContentController = [[WKUserContentController alloc] init];
    
    WKWebViewConfiguration* configuration = [[WKWebViewConfiguration alloc] init];
    configuration.userContentController = userContentController;
    [configuration.preferences setValue:@TRUE forKey:@"allowFileAccessFromFileURLs"];

    self.webView = [[WKWebView alloc] initWithFrame:webViewBounds configuration:configuration];
	self.webView.autoresizingMask = UIViewAutoresizingFlexibleWidth|UIViewAutoresizingFlexibleHeight;
	
    self.webViewUIDelegate = [[WebViewUIDelegate alloc] initWithTitle:[[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleDisplayName"] viewController:self];
    self.webView.UIDelegate = self.webViewUIDelegate;
    self.webView.navigationDelegate = self;
	self.webView.backgroundColor = UIColor.blackColor;
	self.webView.scrollView.backgroundColor = UIColor.blackColor;
	self.view.backgroundColor = UIColor.grayColor;
    self.webView.scrollView.bounces = false;
	self.webView.scrollView.alwaysBounceVertical = true;
	self.webView.scrollView.delegate = self;
	[self.webView setOpaque:NO];
    [self.view addSubview:self.webView];
    [self.view sendSubviewToBack:self.webView];
	[self removeInputAccessoryViewFromWKWebView:self.webView];
	if (_urlToLoad)
		[self openURL:_urlToLoad];
}

- (CGRect)safeRootRect
{
	CGRect rect = self.view.bounds;
	if (@available(iOS 11.0, *)) {
		UIEdgeInsets insets = self.view.safeAreaInsets;
		rect.origin.x = insets.left;
		rect.origin.y = insets.top;
		rect.size.width -= insets.left + insets.right;
		rect.size.height -= insets.top + insets.bottom;
	} else {
		// Fallback on earlier versions
	}
	return rect;
}

- (void)viewSafeAreaInsetsDidChange
{
	UIEdgeInsets insets = self.view.safeAreaInsets;
	CGRect rect = self.view.bounds;
	rect.origin.x = insets.left;
	rect.origin.y = insets.top;
	rect.size.width -= insets.left + insets.right;
	rect.size.height -= insets.top + insets.bottom;
	self.webView.frame = rect;
	[super viewSafeAreaInsetsDidChange];
}

- (void)keyboardWillShow:(NSNotification*)aNotification
{
   // NSLog(@"keyboardWillShow: %@", aNotification);
    [self moveWebViewForKeyboard:aNotification up:YES];
}


- (void)keyboardWillHide:(NSNotification*)aNotification
{
//    NSLog(@"keyboardWillHide: %@", aNotification);
    [self moveWebViewForKeyboard:aNotification up:NO];
}


#pragma mark - Convenience

// TODO we should handle split keyboard
- (void)moveWebViewForKeyboard:(NSNotification*)aNotification up:(BOOL)up
{
    NSDictionary* userInfo = [aNotification userInfo];
    NSTimeInterval animationDuration;
    UIViewAnimationCurve animationCurve;
    CGRect keyboardEndFrame;
	
	
    [[userInfo objectForKey:UIKeyboardAnimationCurveUserInfoKey] getValue:&animationCurve];
    [[userInfo objectForKey:UIKeyboardAnimationDurationUserInfoKey] getValue:&animationDuration];
    [[userInfo objectForKey:UIKeyboardFrameEndUserInfoKey] getValue:&keyboardEndFrame];


    CGRect keyboardFrame = [self.view convertRect:keyboardEndFrame fromView:self.view.window];
    CGRect bounds = self.view.bounds;
	
    BOOL isKeyboardShowing = CGRectIntersectsRect(bounds, keyboardEndFrame);
	
    CGRect oldFrame = _webView.frame;
    CGRect newFrame = [self safeRootRect];
	
    if (keyboardEndFrame.size.height > 0)
        CGRectDivide(newFrame, &newFrame, &keyboardFrame, keyboardFrame.origin.y-newFrame.origin.y, CGRectMinYEdge);

    [UIView beginAnimations:nil context:nil];
    [UIView setAnimationDuration:animationDuration];
    [UIView setAnimationCurve:animationCurve];
	
    self.webView.frame = newFrame;

    [UIView commitAnimations];
}

-(void)viewWillDisappear:(BOOL)animated
{
    [[NSNotificationCenter defaultCenter]
	  removeObserver:self
                    name:UIKeyboardWillHideNotification
                  object:nil];

    [[NSNotificationCenter defaultCenter]
	  removeObserver:self
                    name:UIKeyboardWillShowNotification
                  object:nil];
}



- (void)openURL:(NSURL*)url {
	[self.webView setOpaque:YES];
	self.urlToLoad = url;
	SEL sel = NSSelectorFromString(@"loadFileURL:allowingReadAccessToURL:");
    if ([self.webView respondsToSelector:sel] && self.useLoadFileURLreadAccessURL) {
        NSString* directory = [self.urlToLoad.absoluteString stringByDeletingLastPathComponent];
        ((id (*)(id, SEL, id, id))objc_msgSend)(self.webView, sel, self.urlToLoad, [NSURL URLWithString:directory]);
    } else {
        // load the passed in URL
        [self.webView loadRequest:[NSURLRequest requestWithURL:self.urlToLoad]];
    }
}

- (void)removeInputAccessoryViewFromWKWebView:(WKWebView *)webView {
    UIView *targetView;

    for (UIView *view in webView.scrollView.subviews) {
        if([[view.class description] hasPrefix:@"WKContent"]) {
            targetView = view;
        }
    }

    if (!targetView) {
        return;
    }

    NSString *noInputAccessoryViewClassName = [NSString stringWithFormat:@"%@_NoInputAccessoryView", targetView.class.superclass];
    Class newClass = NSClassFromString(noInputAccessoryViewClassName);

    if(newClass == nil) {
        newClass = objc_allocateClassPair(targetView.class, [noInputAccessoryViewClassName cStringUsingEncoding:NSASCIIStringEncoding], 0);
        if(!newClass) {
            return;
        }

        Method method = class_getInstanceMethod([_NoInputAccessoryView class], @selector(inputAccessoryView));

        class_addMethod(newClass, @selector(inputAccessoryView), method_getImplementation(method), method_getTypeEncoding(method));

        objc_registerClassPair(newClass);
    }

    object_setClass(targetView, newClass);
}

- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}

- (void)viewWillAppear:(BOOL)animated {
	[super viewWillAppear:animated];

	[self adjustView];
	
	    [[NSNotificationCenter defaultCenter]
	  addObserver:self
             selector:@selector(keyboardWillShow:)
                 name:UIKeyboardWillShowNotification
               object:nil];

    [[NSNotificationCenter defaultCenter]
	  addObserver:self
             selector:@selector(keyboardWillHide:)
                 name:UIKeyboardWillHideNotification
               object:nil];

}

#pragma mark WKNavigationDelegate

- (void)alert:(NSString*)message
{
    UIAlertController* alert =
    [UIAlertController
     alertControllerWithTitle:[[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleDisplayName"]
                    message:message
                    preferredStyle:UIAlertControllerStyleAlert];
    
    UIAlertAction* ok =
    [UIAlertAction actionWithTitle:NSLocalizedString(@"OK", @"OK")
                    style:UIAlertActionStyleDefault
                   handler:^(UIAlertAction* action)
                         {
                             [alert dismissViewControllerAnimated:YES completion:nil];
                         }];
    
    [alert addAction:ok];
    
    [self presentViewController:alert animated:YES completion:nil];
}

- (void)webView:(WKWebView *)webView
didFailNavigation:(WKNavigation *)navigation
      withError:(NSError *)error
{
    NSLog(@"%@", [error localizedDescription]);
    [self alert:[error localizedDescription]];
}

- (void)webView:(WKWebView *)webView
didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error
{
    NSLog(@"%@", [error localizedDescription]);
    [self alert:[error localizedDescription]];
}

- (void)webView:(WKWebView *)webView
didFinishNavigation:(WKNavigation *)navigation
{
    NSLog(@"didFinishNavigation");
	if (webView.title != nil && webView.title.length != 0) {
		self.title = webView.title;
	} else {
		self.title = _urlToLoad.path.lastPathComponent;
	}
    if (_deviceToken) {
        [webView evaluateJavaScript:[NSString stringWithFormat:@"app.setDeviceInfo('%@','%@')", _deviceToken, DEVICE_TYPE]
         completionHandler:nil];
    }
    _loaded = YES;
}


- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler
{
    NSLog(@"URL: %@", [navigationAction.request.URL description]);
    if ([navigationAction.request.URL.host isEqualToString:@"127.0.0.1"]) {
    	NSURLRequest *req = navigationAction.request;
    	if ([req.URL.path containsString:@"/blob/"]) {
    			NSURL *url = req.URL;
				NSURLComponents *urlComponents = [NSURLComponents componentsWithURL:url
                                            resolvingAgainstBaseURL:NO];
		
    		   NSString *newName = req.URL.path.lastPathComponent;
				for (NSURLQueryItem *item in urlComponents.queryItems) {
					if ([item.name isEqualToString:@"name"]) {
						newName = item.value;
						break;
					}
				}
				#if 0
				NSString* documentsPath = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
				NSURL *theFile = [NSURL fileURLWithPath:[documentsPath stringByAppendingPathComponent:newName]];
				#else
				NSFileManager *fm = [NSFileManager defaultManager];
				NSURL*  theFile = [[fm temporaryDirectory] URLByAppendingPathComponent:newName];
				#endif
				if (!_alert)
					_alert = [self alertWithoutOK:@"Downloading" message:@""];
				[NSURLConnection sendAsynchronousRequest:req queue:[NSOperationQueue currentQueue]
					completionHandler: ^(NSURLResponse * response, NSData * data, NSError * error) {
						NSHTTPURLResponse * httpResponse = (NSHTTPURLResponse*)response;
						if (_alert) {
							[_alert dismissViewControllerAnimated:NO completion:nil];
							_alert = nil;
						}
						if(httpResponse.statusCode == 200) {
							BOOL ok = [data writeToFile:theFile.path atomically:YES];
							if (ok) {
								_previewURL = theFile;
								[self openPreview];
							} else {
								[self alert:@"Not Saved" message:@"write file error"];
							}
						} else {
							[self alert:@"Not Saved" message:@"export file error"];
						}
				}];
			decisionHandler(WKNavigationActionPolicyCancel);
		} else {
    		decisionHandler(WKNavigationActionPolicyAllow);
    	}
	} else {
		[[UIApplication sharedApplication] openURL:navigationAction.request.URL options:@{} completionHandler:nil];
		decisionHandler(WKNavigationActionPolicyCancel);
    }
}

- (NSInteger)numberOfPreviewItemsInPreviewController:(nonnull QLPreviewController *)controller {
	return _previewURL ? 1 : 0;
}

- (nonnull id<QLPreviewItem>)previewController:(nonnull QLPreviewController *)controller previewItemAtIndex:(NSInteger)index {
	return _previewURL;
}


@end
