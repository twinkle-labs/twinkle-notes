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
#import "WebViewController.h"
#include "twk.h"
#import <UserNotifications/UserNotifications.h>

#define PORT 6780

@interface AppDelegate () <UISplitViewControllerDelegate>
{
	UIWindow *_window;
    WebViewController *_webController;
}
@end

@implementation AppDelegate

static int active_port = 0;

#define MESG_HTTPD_STARTED "(httpd-started"
#define MESG_HTTPD_FAILED "(httpd-failed"
static void receive_message(void *ctx, const char* s)
{
	NSLog(@"TWK MESSAGE: %s", s);
	WebViewController *c = (__bridge WebViewController*)ctx;
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
			[c performSelectorOnMainThread:@selector(alert:)
				withObject:@"FATAL: APP SERVER FAILED"
				waitUntilDone:NO];
			active_port = 0;
		}
	}
}

+ (NSString*) serializeDeviceToken:(NSData*) deviceToken
{
    NSMutableString *str = [NSMutableString stringWithCapacity:64];
    int length = (int)[deviceToken length];
    char *bytes = malloc(sizeof(char) * length);

    [deviceToken getBytes:bytes length:length];

    for (int i = 0; i < length; i++)
    {
        [str appendFormat:@"%02.2hhX", bytes[i]];
    }
    free(bytes);

    return str;
}

- (void)application:(UIApplication *)application
    didReceiveRemoteNotification:(NSDictionary *)userInfo
    fetchCompletionHandler:(void (^)(UIBackgroundFetchResult result))completionHandler
{
    NSLog(@"receiveRemoteNotification: %@", userInfo.description);
}

- (void)application:(UIApplication *)application
    didReceiveRemoteNotification:(NSDictionary *)userInfo
{
    NSLog(@"!receiveRemoteNotification: %@", userInfo.description);
}

- (void)application:(UIApplication *)application
didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
    NSString *tokenString = [AppDelegate serializeDeviceToken:deviceToken];
    NSLog(@"deviceToken=%@", tokenString);
    [_webController setDeviceToken:tokenString];
}

- (void)application:(UIApplication *)application
didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
    NSLog(@"can not register for notification: %@", error);
}

- (void)requestDeviceToken
{
    if (@available(iOS 10, *)) {
        [[UNUserNotificationCenter currentNotificationCenter]
        requestAuthorizationWithOptions:UNAuthorizationOptionAlert|UNAuthorizationOptionSound completionHandler:^(BOOL granted, NSError * _Nullable error)
        {
            NSLog(@"grant Access:%d",granted);

            if (granted) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [[UIApplication sharedApplication] registerForRemoteNotifications];
                });
            }
        }];
    } else {
        [[UIApplication sharedApplication] registerUserNotificationSettings:[UIUserNotificationSettings settingsForTypes:(UIUserNotificationTypeSound |    UIUserNotificationTypeAlert | UIUserNotificationTypeBadge) categories:nil]];
           [[UIApplication sharedApplication] registerForRemoteNotifications];
    }

}

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
	NSString *docs =NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)[0];
	NSLog(@"Documents:%@", docs);
	
	twk_set_var_path(docs.UTF8String);
	twk_set_dist_path([NSBundle mainBundle].bundlePath.UTF8String);
	

	// Override point for customization after application launch.
	_window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];

	_webController = [[WebViewController alloc] init];
	
	_window.rootViewController = _webController;
	
	twk_set_receive_message(receive_message, (__bridge void *)(_webController));
    static const char *args[] = {
      "twk", "launch", "control", "--port", ",6780"
    };
    int ret = twk_start(sizeof(args)/sizeof(args[0]), args);
    if (ret != 0) {
      fprintf(stderr, "twk_start() error\n");
      exit(-1);
    }

	[_window makeKeyAndVisible];
	[self requestDeviceToken];
	return YES;
}


- (void)applicationWillResignActive:(UIApplication *)application {
	// Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
	// Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
}


- (void)applicationDidEnterBackground:(UIApplication *)application {
	// Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
	// If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
}


- (void)applicationWillEnterForeground:(UIApplication *)application {
	// Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
}


- (void)applicationDidBecomeActive:(UIApplication *)application {
	// Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
}


- (void)applicationWillTerminate:(UIApplication *)application {
	// Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
}


#pragma mark - Split view

- (BOOL)splitViewController:(UISplitViewController *)splitViewController collapseSecondaryViewController:(UIViewController *)secondaryViewController ontoPrimaryViewController:(UIViewController *)primaryViewController {
	return NO;
}

@end
