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

#import "WebViewUIDelegate.h"

@implementation WebViewUIDelegate

- (instancetype) init
{
	self = [super init];
	if (self) {
		[self __initWithTitle:nil viewController:nil];
	}
	
	return self;
}

- (instancetype) initWithTitle:(NSString*)title
{
	self = [super init];
	if (self) {
		[self __initWithTitle:title viewController:nil];
	}
	
	return self;
}

- (instancetype) initWithTitle:(NSString*)title viewController:(UIViewController*)viewController
{
	self = [super init];
	if (self) {
		[self __initWithTitle:title viewController:viewController];
	}
	
	return self;
}

- (void) __initWithTitle:(NSString*)title viewController:(UIViewController*)viewController
{
	self.title = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleDisplayName"];
	self.viewController = [UIApplication sharedApplication].delegate.window.rootViewController;
	
	if (title != nil) {
		self.title = title;
	}
	
	if (viewController != nil) {
		self.viewController = viewController;
	}
}

- (void) webView:(WKWebView*)webView runJavaScriptAlertPanelWithMessage:(NSString*)message
initiatedByFrame:(WKFrameInfo*)frame completionHandler:(nonnull void (^)(void))completionHandler
{
	UIAlertController* alert = [UIAlertController alertControllerWithTitle:self.title
																   message:message
															preferredStyle:UIAlertControllerStyleAlert];
	
	UIAlertAction* ok = [UIAlertAction actionWithTitle:NSLocalizedString(@"OK", @"OK")
												 style:UIAlertActionStyleDefault
											   handler:^(UIAlertAction* action)
						 {
							 completionHandler();
							 [alert dismissViewControllerAnimated:YES completion:nil];
						 }];
	
	[alert addAction:ok];
	
	[self.viewController presentViewController:alert animated:YES completion:nil];
}

- (void) webView:(WKWebView*)webView runJavaScriptConfirmPanelWithMessage:(NSString*)message
initiatedByFrame:(WKFrameInfo*)frame completionHandler:(void (^)(BOOL result))completionHandler
{
	UIAlertController* alert = [UIAlertController alertControllerWithTitle:self.title
																   message:message
															preferredStyle:UIAlertControllerStyleAlert];
	
	UIAlertAction* ok = [UIAlertAction actionWithTitle:NSLocalizedString(@"OK", @"OK")
												 style:UIAlertActionStyleDefault
											   handler:^(UIAlertAction* action)
						 {
							 completionHandler(YES);
							 [alert dismissViewControllerAnimated:YES completion:nil];
						 }];
	
	[alert addAction:ok];
	
	UIAlertAction* cancel = [UIAlertAction actionWithTitle:NSLocalizedString(@"Cancel", @"Cancel")
													 style:UIAlertActionStyleDefault
												   handler:^(UIAlertAction* action)
        {
			completionHandler(NO);
			[alert dismissViewControllerAnimated:YES completion:nil];
		}];
	
	[alert addAction:cancel];
	
	[self.viewController presentViewController:alert animated:YES completion:nil];
}

- (void) webView:(WKWebView*)webView runJavaScriptTextInputPanelWithPrompt:(NSString*)prompt
	 defaultText:(NSString*)defaultText initiatedByFrame:(WKFrameInfo*)frame
completionHandler:(void (^)(NSString* result))completionHandler
{
	UIAlertController* alert = [UIAlertController alertControllerWithTitle:self.title
																   message:prompt
															preferredStyle:UIAlertControllerStyleAlert];
	
	UIAlertAction* ok = [UIAlertAction actionWithTitle:NSLocalizedString(@"OK", @"OK")
												 style:UIAlertActionStyleDefault
											   handler:^(UIAlertAction* action)
						 {
							 completionHandler(((UITextField*)alert.textFields[0]).text);
							 [alert dismissViewControllerAnimated:YES completion:nil];
						 }];
	
	[alert addAction:ok];
	
	UIAlertAction* cancel = [UIAlertAction actionWithTitle:NSLocalizedString(@"Cancel", @"Cancel")
													 style:UIAlertActionStyleDefault
												   handler:^(UIAlertAction* action)
        {
			completionHandler(nil);
			[alert dismissViewControllerAnimated:YES completion:nil];
		}];
	
	[alert addAction:cancel];
	
	[alert addTextFieldWithConfigurationHandler:^(UITextField* textField) {
		textField.text = defaultText;
	}];
	
	[self.viewController presentViewController:alert animated:YES completion:nil];
}

@end
