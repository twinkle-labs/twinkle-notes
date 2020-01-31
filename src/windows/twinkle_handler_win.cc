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

#include "twinkle_handler.h"

#include <windows.h>
#include <string>
#include "resource.h"
#include "include/cef_browser.h"

void TwinkleHandler::PlatformTitleChange(
    CefRefPtr<CefBrowser> browser,
    const CefString&      title)
{
    CefWindowHandle hwnd = browser->GetHost()->GetWindowHandle();
    SetWindowText(hwnd, std::wstring(title).c_str());
    HANDLE hIcon = (HICON)LoadImage(GetModuleHandle(0), MAKEINTRESOURCE(IDI_SMALL), IMAGE_ICON, 32, 32, 0);
    SendMessage(hwnd, WM_SETICON, ICON_SMALL, (LPARAM)hIcon);
}
