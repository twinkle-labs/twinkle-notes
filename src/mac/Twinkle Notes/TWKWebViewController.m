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



#import "TWKWebViewController.h"
#import "TWKWindowController.h"

#import <WebKit/WebKit.h>

@interface TWKWebViewController ()<WKNavigationDelegate>
{
		WKWebView *_webView;
}
@end

@implementation TWKWebViewController

- (void)loadView
{
	self.view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 320, 480)];
	[self.view setWantsLayer:YES];
	[self.view.layer setBackgroundColor:[[NSColor blackColor] CGColor]];
}

- (void)openURL:(NSURL*)url
{
	if (!_webView) {
		_webView = [[WKWebView alloc] initWithFrame:self.view.bounds];
		_webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
		_webView.navigationDelegate = self;
		[self.view addSubview:_webView];
	}
	NSURLRequest *req = [NSURLRequest requestWithURL:url];
	if (![_webView loadRequest:req]) {
		NSLog(@"Bad");
	}
}

- (void)viewDidLoad
{
	[super viewDidLoad];
}

- (void)webView:(WKWebView *)webView
didFailNavigation:(WKNavigation *)navigation
      withError:(NSError *)error
{
    NSLog(@"%@", [error localizedDescription]);
}

- (void)webView:(WKWebView *)webView
didFailProvisionalNavigation:(WKNavigation *)navigation
      withError:(NSError *)error
{
    NSLog(@"%@", [error localizedDescription]);
}

- (void)webView:(WKWebView *)webView
didFinishNavigation:(WKNavigation *)navigation
{
	if (webView.title != nil && webView.title.length != 0) {
		self.title = webView.title;
	}
}

-(void)alert:(NSString*)title
{
	[self alert:title message:@""];
}

-(void)alert:(NSString*)title message:(NSString*)message
{
 NSAlert *alert = [[NSAlert alloc] init];
 [alert addButtonWithTitle:@"OK"];
 [alert setMessageText:title];
 [alert setInformativeText:message];
 [alert setAlertStyle:NSInformationalAlertStyle];
 [alert beginSheetModalForWindow:[self.view window] modalDelegate:nil didEndSelector:nil contextInfo:nil];
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
    		   NSSavePanel*    panel = [NSSavePanel savePanel];
			   [panel setNameFieldStringValue:newName];
			   [panel beginSheetModalForWindow:self.view.window completionHandler:^(NSInteger result){
						if (result == NSFileHandlingPanelOKButton)
						{
							NSURL*  theFile = [panel URL];
							
						//	NSMutableURLRequest *newReq = [NSMutableURLRequest //requestWithURL:req.URL];
							
//								NSDictionary *cookieProps = @{ NSHTTPCookieDomain: [url host], NSHTTPCookiePath  : @"/",
//				       NSHTTPCookieName  : @"cookieName", NSHTTPCookieValue : @"cookieValue" };
//	NSDictionary *headerFields = [NSHTTPCookie requestHeaderFieldsWithCookies:@[[NSHTTPCookie cookieWithProperties:cookiesProps]]];
//	[request setAllHTTPHeaderFields:headerFields];
//	[request setHTTPShouldHandleCookies:YES];

							
							[NSURLConnection sendAsynchronousRequest:req queue:[NSOperationQueue currentQueue]
								completionHandler: ^(NSURLResponse * response, NSData * data, NSError * error) {
									NSHTTPURLResponse * httpResponse = (NSHTTPURLResponse*)response;
									if(httpResponse.statusCode == 200) {
										BOOL ok = [data writeToFile:theFile.path atomically:YES];
										if (ok) {
											[self alert:@"OK Saved" message:theFile.path];
										} else {
											[self alert:@"Not Saved" message:@"write file error"];
										}
									} else {
										[self alert:@"Not Saved" message:@"export file error"];
									}
       						}];
						}
					}];
			decisionHandler(WKNavigationActionPolicyCancel);
		} else {
    		decisionHandler(WKNavigationActionPolicyAllow);
    	}
	} else {
//		NSWindow *w = [[NSWindow alloc] init];
//		w.contentView.bounds = NSMakeRect(0, 0, 640, 480);
//		TWKWindowController *wc = [[TWKWindowController alloc] initWithWindow:w];
//		[wc showWindow:nil];
		[[NSWorkspace sharedWorkspace] openURL:navigationAction.request.URL];
		decisionHandler(WKNavigationActionPolicyCancel);
    }
}

@end
