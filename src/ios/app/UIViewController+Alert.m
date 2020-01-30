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



#import "UIViewController+Alert.h"

@implementation UIViewController(Alert)

- (void)alert:(NSString *)title
{
	[self alert:title message:nil];
}

- (UIAlertController *)alertWithoutOK:(NSString *)title message:(NSString*)msg
{
	UIAlertController * alertController = [UIAlertController
										   alertControllerWithTitle:title
										   message: msg
										   preferredStyle:UIAlertControllerStyleAlert];
	[self presentViewController:alertController animated:YES completion:nil];
	return alertController;
}

- (void)alert:(NSString *)title message:(NSString*)msg
{
	UIAlertController * alertController = [UIAlertController
										   alertControllerWithTitle:title
										   message: msg
										   preferredStyle:UIAlertControllerStyleAlert];
	[alertController addAction:[UIAlertAction actionWithTitle:@"OK"
														style:UIAlertActionStyleDefault
													  handler:^(UIAlertAction *action)
								{
								}]];
	
	[self presentViewController:alertController animated:YES completion:nil];
}

- (void)alert:(NSString *)title message:(NSString *)message confirm:(void(^)(BOOL ok))completion
{
	UIAlertController * alertController = [UIAlertController
										   alertControllerWithTitle:title
										   message: message
										   preferredStyle:UIAlertControllerStyleAlert];
	[alertController addAction:[UIAlertAction actionWithTitle:@"YES"
														style:UIAlertActionStyleDefault
													  handler:^(UIAlertAction *action)
								{
									completion(YES);
								}]];
	[alertController addAction:[UIAlertAction actionWithTitle:@"NO"
														style:UIAlertActionStyleCancel
													  handler:^(UIAlertAction *action)
								{
									completion(NO);
								}]];
	
	[self presentViewController:alertController animated:YES completion:nil];
}

- (void)alertTextFieldDidBegin:(UITextField *)textField
{
    NSString *t = textField.text;
    if (t.pathExtension.length > 0) {
        UITextPosition *pos = [textField positionFromPosition:[textField beginningOfDocument] offset:t.length - t.pathExtension.length-1];
        [textField setSelectedTextRange:[textField textRangeFromPosition:pos toPosition:pos]];
    }
}

- (void)alert:(NSString *)title message:(NSString *)message options:(NSDictionary*)options prompt:(void(^)(NSString* text))completion
{
	UIAlertController * alertController;
	alertController = [UIAlertController alertControllerWithTitle: title
														  message: message
												   preferredStyle:UIAlertControllerStyleAlert];
	
    [alertController addTextFieldWithConfigurationHandler:^(UITextField *textField) {
		if (options[@"text"]) {
			textField.text = options[@"text"];
            if (options[@"is_filename"]) {
               [textField addTarget:self
                           action:@selector(alertTextFieldDidBegin:)
                    forControlEvents:UIControlEventEditingDidBegin];
            }
		}
        textField.keyboardType = UIKeyboardTypeASCIICapable;
        textField.autocapitalizationType = UITextAutocapitalizationTypeNone;
        textField.autocorrectionType = UITextAutocorrectionTypeNo;
        textField.clearButtonMode = UITextFieldViewModeWhileEditing;
    }];

	// Add OK action
	[alertController addAction:
	 [UIAlertAction actionWithTitle:@"OK"
							  style:UIAlertActionStyleDefault
							handler:^(UIAlertAction *action)
	  {
		  NSArray * textfields = alertController.textFields;
		  UITextField * namefield = textfields[0];
		  completion(namefield.text);
	  }]];
	
	// Add CANCEL action
	[alertController addAction:[UIAlertAction actionWithTitle:@"Cancel"
														style:UIAlertActionStyleCancel
													  handler:^(UIAlertAction *action){
													  completion(nil);
													  }]];
	
	[self presentViewController:alertController animated:YES completion:nil];

}

@end
