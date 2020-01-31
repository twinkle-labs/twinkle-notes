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

#ifndef TWINKLE_HANDLER_H_
#define TWINKLE_HANDLER_H_

#include "include/cef_client.h"
#include "include/cef_dialog_handler.h"

#include <list>

class TwinkleHandler : 
	public CefClient,
	public CefDisplayHandler,
	public CefLifeSpanHandler,
	public CefRequestHandler,
	public CefDownloadHandler,
	public CefDialogHandler,
	public CefLoadHandler 
{
 public:
	explicit TwinkleHandler(bool use_views);
	~TwinkleHandler();

	// Provide access to the single global instance of this object.
	static TwinkleHandler* GetInstance();

	// CefClient methods:
	virtual CefRefPtr<CefDisplayHandler> GetDisplayHandler() OVERRIDE {
		return this;
	}
	virtual CefRefPtr<CefDownloadHandler> GetDownloadHandler() OVERRIDE {
		return this;
	}
  
	virtual CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() OVERRIDE {
		return this;
	}
	virtual CefRefPtr<CefLoadHandler> GetLoadHandler() OVERRIDE { return this; }

	virtual CefRefPtr<CefRequestHandler> GetRequestHandler () OVERRIDE {
		return this;
	};

#ifdef __linux__

    virtual CefRefPtr<CefDialogHandler> GetDialogHandler () OVERRIDE {
        return this;
    };
  
    // CefDialogHandler methods.
    bool OnFileDialog(CefRefPtr<CefBrowser> browser,
              FileDialogMode mode,
              const CefString& title,
              const CefString& default_file_path,
              const std::vector<CefString>& accept_filters,
              int selected_accept_filter,
              CefRefPtr<CefFileDialogCallback> callback) OVERRIDE;
#endif

    // CefDisplayHandler methods:
    virtual void OnTitleChange(CefRefPtr<CefBrowser> browser,
                   const CefString& title) OVERRIDE;

    // CefLifeSpanHandler methods:
    virtual void OnAfterCreated(CefRefPtr<CefBrowser> browser) OVERRIDE;
    virtual bool DoClose(CefRefPtr<CefBrowser> browser) OVERRIDE;
    virtual void OnBeforeClose(CefRefPtr<CefBrowser> browser) OVERRIDE;
    virtual void OnBeforeDownload(CefRefPtr<CefBrowser> browser, 
                      CefRefPtr<CefDownloadItem> download_item, 
                      const CefString& suggested_name, 
                      CefRefPtr<CefBeforeDownloadCallback> callback) OVERRIDE;

    // CefLoadHandler methods:
    virtual void OnLoadError(CefRefPtr<CefBrowser> browser,
                 CefRefPtr<CefFrame> frame,
                 ErrorCode errorCode,
                 const CefString& errorText,
                 const CefString& failedUrl) OVERRIDE;

    // Request that all existing browser windows close.
    void CloseAllBrowsers(bool force_close);

    bool IsClosing() const { return is_closing_; }

    // CefRequestHandler
    virtual CefRequestHandler::ReturnValue OnBeforeResourceLoad(
                                    CefRefPtr< CefBrowser > browser,
                                    CefRefPtr< CefFrame > frame,
                                    CefRefPtr< CefRequest > request,
                                    CefRefPtr< CefRequestCallback > callback ) OVERRIDE;
    CefRefPtr<CefBrowser> GetFirstBrowser();
 
 private:
    // Platform-specific implementation.
    void PlatformTitleChange(CefRefPtr<CefBrowser> browser,
                 const CefString& title);

    // True if the application is using the Views framework.
    const bool use_views_;

    // List of existing browser windows. Only accessed on the CEF UI thread.
    typedef std::list<CefRefPtr<CefBrowser>> BrowserList;
    BrowserList browser_list_;

    bool is_closing_;

    // Include the default reference counting implementation.
    IMPLEMENT_REFCOUNTING(TwinkleHandler);
};

#endif
