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

#include <windows.h>
#include <direct.h>

#include "include/cef_sandbox_win.h"
#include "twinkle_app.h"
#include "twk.h"

#include <shlwapi.h>
#pragma comment(lib,"shlwapi.lib")
#include "shlobj.h"

static int mkpath(char *path)
{
	char *p = path+3;
	while (p&&*p) {
		p = strchr(p + 1, '/');
		if (p) *p = 0;
		if (_mkdir(path) == -1) {
			if (errno != EEXIST) {
				if (p) *p = '/';
				return -1;
			}
		}
		if (p) {
			*p++ = '/';
		}
	}
	return 0;
}

static char cef_cache_path[1024];
static char app_data_path[1024];

static void fix_path(char *s)
{
	while (*s) {
		if (*s == '\\') *s = '/';
		s++;
	}
}

static void init_dirs()
{
	char buf[1024];

	GetModuleFileNameA(NULL, buf, sizeof(buf));
	fix_path(buf);
	*strrchr(buf, '/') = 0;
	printf("dist:%s\n", buf);
	twk_set_dist_path(buf);

	if (!SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, app_data_path)))
	{
		fprintf(stderr, "Can not get local appdata\n");
		exit(-1);
	}
	fix_path(app_data_path);

	snprintf(buf, sizeof(buf), "%s/Twinkle/run", app_data_path);
	if (mkpath(buf) < 0) {
		fprintf(stderr, "Can not create *var-path*: %s\n", buf);
		exit(-1);
	}
	chdir(buf);
	*strrchr(buf, '/') = 0;
	printf("var:%s\n", buf);
	twk_set_var_path(buf);

	snprintf(cef_cache_path, sizeof(cef_cache_path),
		"%s/Twinkle/cache/cef_cache",
		app_data_path);
	if (mkpath(cef_cache_path) < 0) {
		fprintf(stderr, "can not create cache path\n");
		exit(-1);
	}
}

// Entry point function for all processes.
int APIENTRY wWinMain(HINSTANCE hInstance,
                      HINSTANCE hPrevInstance,
                      LPTSTR lpCmdLine,
                      int nCmdShow) {
  UNREFERENCED_PARAMETER(hPrevInstance);
  UNREFERENCED_PARAMETER(lpCmdLine);



  // Enable High-DPI support on Windows 7 or newer.
  CefEnableHighDPISupport();

  void* sandbox_info = NULL;

#if defined(CEF_USE_SANDBOX)
  // Manage the life span of the sandbox information object. This is necessary
  // for sandbox support on Windows. See cef_sandbox_win.h for complete details.
  CefScopedSandboxInfo scoped_sandbox;
  sandbox_info = scoped_sandbox.sandbox_info();
#endif

  // Provide CEF with command-line arguments.
  CefMainArgs main_args(hInstance);

  // CEF applications have multiple sub-processes (render, plugin, GPU, etc)
  // that share the same executable. This function checks the command-line and,
  // if this is a sub-process, executes the appropriate logic.
  int exit_code = CefExecuteProcess(main_args, NULL, sandbox_info);
  if (exit_code >= 0) {
    // The sub-process has completed so return here.
    return exit_code;
  }

  HANDLE mutex;
  mutex = CreateMutex(NULL, TRUE, L"TWKNOTESMTX");
  if (GetLastError() == ERROR_ALREADY_EXISTS)
  {
	  // This is a second instance. Bring the 
	  // original instance to the top.
	  HWND hWnd;
	  hWnd = FindWindow(NULL, L"Twinkle Notes");
	  if (hWnd) {
		  SetForegroundWindow(hWnd);
		  ShowWindow(hWnd, SW_RESTORE);
	  }
	  return 0;
   }

#ifdef _DEBUG
  AllocConsole();
  freopen("CONOUT$", "w", stdout);
  freopen("CONOUT$", "w", stderr);
#endif  

  init_dirs();

  // Specify CEF global settings here.
  CefSettings settings;

#if !defined(CEF_USE_SANDBOX)
  settings.no_sandbox = true;
#endif

  CefString(&settings.cache_path).FromString(cef_cache_path);

  // TwinkleApp implements application-level callbacks for the browser process.
  // It will create the first browser instance in OnContextInitialized() after
  // CEF has initialized.
  CefRefPtr<TwinkleApp> app(new TwinkleApp);

  // Initialize CEF.
  CefInitialize(main_args, settings, app.get(), sandbox_info);

  // Run the CEF message loop. This will block until CefQuitMessageLoop() is
  // called.
  CefRunMessageLoop();

  // Shut down CEF.
  CefShutdown();
  if (mutex) {
	  CloseHandle(mutex);
  }
  return 0;
}
