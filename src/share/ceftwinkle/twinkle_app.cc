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


#include "twinkle_app.h"

#include <string>

#include "include/base/cef_bind.h"
#include "include/wrapper/cef_closure_task.h"
#include "include/cef_browser.h"
#include "include/cef_command_line.h"
#include "include/views/cef_browser_view.h"
#include "include/views/cef_window.h"
#include "include/wrapper/cef_helpers.h"
#include "twinkle_handler.h"
#include <twk.h>

namespace {

// When using the Views framework this object provides the delegate
// implementation for the CefWindow that hosts the Views-based browser.
class TwinkleWindowDelegate : public CefWindowDelegate {
 public:
  explicit TwinkleWindowDelegate(CefRefPtr<CefBrowserView> browser_view)
      : browser_view_(browser_view) {}

  void OnWindowCreated(CefRefPtr<CefWindow> window) OVERRIDE {
    // Add the browser view and show the window.
    window->AddChildView(browser_view_);
    window->Show();

    // Give keyboard focus to the browser view.
    browser_view_->RequestFocus();
  }

  void OnWindowDestroyed(CefRefPtr<CefWindow> window) OVERRIDE {
    browser_view_ = NULL;
  }

  bool CanClose(CefRefPtr<CefWindow> window) OVERRIDE {
    // Allow the window to close if the browser says it's OK.
    CefRefPtr<CefBrowser> browser = browser_view_->GetBrowser();
    if (browser)
      return browser->GetHost()->TryCloseBrowser();
    return true;
  }

 private:
  CefRefPtr<CefBrowserView> browser_view_;

  IMPLEMENT_REFCOUNTING(TwinkleWindowDelegate);
  DISALLOW_COPY_AND_ASSIGN(TwinkleWindowDelegate);
};

}  // namespace

TwinkleApp::TwinkleApp() {}

void TwinkleApp::OnBeforeCommandLineProcessing(
      const CefString& process_type,
      CefRefPtr<CefCommandLine> command_line)
{
	command_line->AppendSwitchWithValue(
		CefString("enable-media-stream"), CefString("1")
	);
#if 0
	command_line->AppendSwitchWithValue(
		CefString("remote-debugging-port"), CefString("16780")
	);
#endif
}

static void loadAppAtPort(int port)
{
	CEF_REQUIRE_UI_THREAD();
	std::string url;
	if (port == 0) {	
		//url = "file://";
		//url += twk_get_dist_path();
		//url += "/web/pub/error.html";
		url = "about:blank";
	}
	else {
		url = "http://127.0.0.1:";
		url += std::to_string(port);
		url += "/main.html";
	}
	TwinkleHandler::GetInstance()->GetFirstBrowser()->GetMainFrame()->LoadURL(url);
}

static int active_port = 0;

#define MESG_HTTPD_STARTED "(httpd-started"
#define MESG_HTTPD_FAILED "(httpd-failed"
static void receive_message(void *ctx, const char* s)
{
	printf("TWK MESSAGE: %s\n", s);
	if (strstr(s, MESG_HTTPD_STARTED) == s) {
		int port = atoi(s + sizeof(MESG_HTTPD_STARTED));
		if (!active_port) {
			active_port = port;
		}
		else if (active_port == port) {
			return;
		}
		CefPostTask(TID_UI, base::Bind(&loadAppAtPort, port));
	}
	else if (strstr(s, MESG_HTTPD_FAILED) == s) {
		//if (active_port) {
			CefPostTask(TID_UI, base::Bind(&loadAppAtPort, 0));
			active_port = 0;
		//}
	}
}


static void startAppServer()
{
	twk_set_receive_message(receive_message, NULL);
	static const char *args[] = {
		"twk", "launch", "control", "--port", ",6780"
	};
	int ret = twk_start(sizeof(args) / sizeof(args[0]), args);
	if (ret != 0) {
		fprintf(stderr, "twk_start() error\n");
		exit(-1);
	}
}

void TwinkleApp::OnContextInitialized() {
  CEF_REQUIRE_UI_THREAD();

  CefRefPtr<CefCommandLine> command_line =
      CefCommandLine::GetGlobalCommandLine();

#if defined(OS_WIN) || defined(OS_LINUX)
  // Create the browser using the Views framework if "--use-views" is specified
  // via the command-line. Otherwise, create the browser using the native
  // platform framework. The Views framework is currently only supported on
  // Windows and Linux.
  const bool use_views = command_line->HasSwitch("use-views");
#else
  const bool use_views = false;
#endif

  // TwinkleHandler implements browser-level callbacks.
  CefRefPtr<TwinkleHandler> handler(new TwinkleHandler(use_views));

  // Specify CEF browser settings here.
  CefBrowserSettings browser_settings;
  browser_settings.background_color = 0xFF000000;//ARGB
  std::string url;

  // Check if a "--url=" value was provided via the command-line. If so, use
  // that instead of the default URL.
  url = command_line->GetSwitchValue("url");
 // if (url.empty())
 //   url = "about:blank";

  if (use_views) {
    // Create the BrowserView.
    CefRefPtr<CefBrowserView> browser_view = CefBrowserView::CreateBrowserView(
        handler, url, browser_settings, NULL, NULL);

    // Create the Window. It will show itself after creation.
    CefWindow::CreateTopLevelWindow(new TwinkleWindowDelegate(browser_view));
  } else {
    // Information used when creating the native window.
    CefWindowInfo window_info;

#if defined(OS_WIN)
    // On Windows we need to specify certain flags that will be passed to
    // CreateWindowEx().
    window_info.SetAsPopup(NULL, "Twinkle Notes");
#endif

    // Create the first browser window.
    CefBrowserHost::CreateBrowser(window_info, handler, url, browser_settings,
                                  NULL);

  }

  startAppServer();
}
