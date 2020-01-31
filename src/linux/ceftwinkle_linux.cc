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



#include <X11/Xlib.h>
#include <unistd.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <gtk/gtk.h>
#include "twinkle_app.h"
#include "twk.h"

#include "include/base/cef_logging.h"

namespace {

int XErrorHandlerImpl(Display* display, XErrorEvent* event) {
  LOG(WARNING) << "X error received: "
               << "type " << event->type << ", "
               << "serial " << event->serial << ", "
               << "error_code " << static_cast<int>(event->error_code) << ", "
               << "request_code " << static_cast<int>(event->request_code)
               << ", "
               << "minor_code " << static_cast<int>(event->minor_code);
  return 0;
}

int XIOErrorHandlerImpl(Display* display) {
  return 0;
}

}  // namespace


static int mkpath(char *path, mode_t mode)
{
  char *p = path;
  while (p&&*p) {
    p = strchr(p+1, '/');
    if (p) *p = 0;
    if (mkdir(path, mode) == -1) {
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

static int init_dirs()
{
	char buf[1024];

	int n = readlink("/proc/self/exe", buf, sizeof(buf));
	assert(n > 0);
	if (n >= sizeof(buf) || n < 0)
	  exit(-1);
	buf[n] = 0;
	*strrchr(buf,'/')=0;
	printf("dist:%s\n", buf);
	twk_set_dist_path(buf);
	
	snprintf(buf, sizeof(buf), "%s/.config/twinkle/run", getenv("HOME"));
	if (mkpath(buf, 0700) < 0) {
	  fprintf(stderr, "Can not create *var-path*: %s\n", buf);
	  exit(-1);
	}
	chdir(buf);
	*strrchr(buf,'/') = 0;
	printf("var:%s\n", buf);
	twk_set_var_path(buf);

	snprintf(cef_cache_path, sizeof(cef_cache_path),
		 "%s/.config/twinkle/cache/cef_cache",
		 getenv("HOME"));
	if (mkpath(cef_cache_path, 0700) < 0) {
	  fprintf(stderr, "can not create cache path\n");
	  exit(-1);
	}
}

// Entry point function for all processes.
int main(int argc, char* argv[]) 
{
  // IMPORTANT!
  // We are going to use Gtk for file chooser dialog.
  // GDK is also initialized inside gtk_init().
  gtk_init(NULL, NULL);

  // Provide CEF with command-line arguments.
  CefMainArgs main_args(argc, argv);

  // CEF applications have multiple sub-processes (render, plugin, GPU, etc)
  // that share the same executable. This function checks the command-line and,
  // if this is a sub-process, executes the appropriate logic.
  int exit_code = CefExecuteProcess(main_args, NULL, NULL);
  if (exit_code >= 0) {
    // The sub-process has completed so return here.
    return exit_code;
  }

  init_dirs();

  // Install xlib error handlers so that the application won't be terminated
  // on non-fatal errors.
  XSetErrorHandler(XErrorHandlerImpl);
  XSetIOErrorHandler(XIOErrorHandlerImpl);

  // Specify CEF global settings here.
  CefSettings settings;

// When generating projects with CMake the CEF_USE_SANDBOX value will be defined
// automatically. Pass -DUSE_SANDBOX=OFF to the CMake command-line to disable
// use of the sandbox.
#if !defined(CEF_USE_SANDBOX)
  settings.no_sandbox = true;
#endif

  CefString(&settings.cache_path).FromString(cef_cache_path);

  // TwinkleApp implements application-level callbacks for the browser process.
  // It will create the first browser instance in OnContextInitialized() after
  // CEF has initialized.
  CefRefPtr<TwinkleApp> app(new TwinkleApp);

  // Initialize CEF for the browser process.
  CefInitialize(main_args, settings, app.get(), NULL);

  // Run the CEF message loop. This will block until CefQuitMessageLoop() is
  // called.
  CefRunMessageLoop();

  // Shut down CEF.
  CefShutdown();

  return 0;
}
