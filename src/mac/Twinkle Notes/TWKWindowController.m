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



#import "TWKWindowController.h"
#import "TWKWebViewController.h"

@interface TWKWindowController()
{
		TWKWebViewController *_web;
}
@end
@implementation TWKWindowController

- (id)initWithWindow:(NSWindow *)window
{
	self = [super initWithWindow:window];
	_web = [[TWKWebViewController alloc] init];
	// Inheriting window size
	// otherwise it will resized to the webview initial
	// size
	_web.view.frame = window.contentView.bounds;
	self.window.backgroundColor = [NSColor blackColor];
	self.contentViewController = _web;
	return self;
}
@end
