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

#import "AppDelegate.h"
#import "TWKWebViewController.h"
#import "TWKWindowController.h"

#include <twk.h>

@interface AppDelegate ()
{
	TWKWebViewController *_webController;
	TWKWindowController *_wc;
}
@property (weak) IBOutlet NSWindow *window;
@end

@implementation AppDelegate

static int active_port = 0;

#define MESG_HTTPD_STARTED "(httpd-started"
#define MESG_HTTPD_FAILED "(httpd-failed"
static void receive_message(void *ctx, const char* s)
{
	NSLog(@"TWK MESSAGE: %s", s);
	TWKWebViewController *c = (__bridge TWKWebViewController*)ctx;
	if (strstr(s, MESG_HTTPD_STARTED) == s) {
		int port = atoi(s+sizeof(MESG_HTTPD_STARTED));
		if (!active_port) {
			active_port = port;
		} else if (active_port == port) {
			return;
		}
		NSString *s = [NSString stringWithFormat:@"http://127.0.0.1:%d/main.html", port];
		[c performSelectorOnMainThread:@selector(openURL:)
			withObject:[NSURL URLWithString:s]
			waitUntilDone:NO];
	} else if (strstr(s, MESG_HTTPD_FAILED)==s) {
		if (active_port) {
			[c performSelectorOnMainThread:@selector(openURL:)
				withObject:[NSURL URLWithString:@"about:blank"]
				waitUntilDone:NO];
			active_port = 0;
		}
		[c performSelectorOnMainThread:@selector(alert:)
			withObject:@"FATAL: APP SERVER FAILED"
			waitUntilDone:NO];
	}
}


- (void)initTwinkle
{
	NSString *bundleDir = [NSBundle mainBundle].bundlePath;
	NSString *resDir = [bundleDir stringByAppendingPathComponent:@"Contents/Resources"];
	twk_set_dist_path(resDir.UTF8String);

	NSArray *paths = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory,
		NSUserDomainMask, YES);
	NSString *supportDir = [paths firstObject];
	NSString *path = [supportDir stringByAppendingPathComponent:@"Twinkle/var"];
	if (![[NSFileManager defaultManager] createDirectoryAtPath:path withIntermediateDirectories:YES attributes:nil error:nil]) {
		exit(-1);
	}
	twk_set_var_path(path.UTF8String);
	twk_set_receive_message(receive_message, (__bridge void *)(_wc.contentViewController));
  static const char *args[] = {
	  "twk", "launch", "control", "--port", ",6780"
  };
  int ret = twk_start(sizeof(args)/sizeof(args[0]), args);
  if (ret != 0) {
	  fprintf(stderr, "twk_start() error\n");
	  exit(-1);
  }
}

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
	_wc = [[TWKWindowController alloc] initWithWindow:self.window];
	[self initTwinkle];
	[_wc showWindow:nil];
}


- (void)applicationWillTerminate:(NSNotification *)aNotification {
	// Insert code here to tear down your application
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)theApplication {
    return YES;
}

@end
