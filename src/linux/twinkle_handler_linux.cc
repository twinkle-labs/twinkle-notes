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

#include <sys/stat.h>

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <string>
#include <gtk/gtk.h>

#include "include/cef_browser.h"
#include "include/cef_parser.h"
#include "include/wrapper/cef_helpers.h"
#include "include/base/cef_logging.h"


void TwinkleHandler::PlatformTitleChange(CefRefPtr<CefBrowser> browser,
                                        const CefString& title) {
  std::string titleStr(title);

  // Retrieve the X11 display shared with Chromium.
  ::Display* display = cef_get_xdisplay();
  DCHECK(display);

  // Retrieve the X11 window handle for the browser.
  ::Window window = browser->GetHost()->GetWindowHandle();
  DCHECK(window != kNullWindowHandle);

  // Retrieve the atoms required by the below XChangeProperty call.
  const char* kAtoms[] = {"_NET_WM_NAME", "UTF8_STRING"};
  Atom atoms[2];
  int result =
      XInternAtoms(display, const_cast<char**>(kAtoms), 2, false, atoms);
  if (!result)
    NOTREACHED();

  // Set the window title.
  XChangeProperty(display, window, atoms[0], atoms[1], 8, PropModeReplace,
                  reinterpret_cast<const unsigned char*>(titleStr.c_str()),
                  titleStr.size());

  // TODO(erg): This is technically wrong. So XStoreName and friends expect
  // this in Host Portable Character Encoding instead of UTF-8, which I believe
  // is Compound Text. This shouldn't matter 90% of the time since this is the
  // fallback to the UTF8 property above.
  XStoreName(display, browser->GetHost()->GetWindowHandle(), titleStr.c_str());
}


std::string GetDescriptionFromMimeType(const std::string& mime_type) {
  // Check for wild card mime types and return an appropriate description.
  static const struct {
    const char* mime_type;
    const char* label;
  } kWildCardMimeTypes[] = {
    { "audio", "Audio Files" },
    { "image", "Image Files" },
    { "text", "Text Files" },
    { "video", "Video Files" },
  };

  for (size_t i = 0;
       i < sizeof(kWildCardMimeTypes) / sizeof(kWildCardMimeTypes[0]); ++i) {
    if (mime_type == std::string(kWildCardMimeTypes[i].mime_type) + "/*")
      return std::string(kWildCardMimeTypes[i].label);
  }

  return std::string();
}

void AddFilters(GtkFileChooser* chooser,
                const std::vector<CefString>& accept_filters,
                bool include_all_files,
                std::vector<GtkFileFilter*>* filters) {
  bool has_filter = false;

  for (size_t i = 0; i < accept_filters.size(); ++i) {
    const std::string& filter = accept_filters[i];
    if (filter.empty())
      continue;

    std::vector<std::string> extensions;
    std::string description;

    size_t sep_index = filter.find('|');
    if (sep_index != std::string::npos) {
      // Treat as a filter of the form "Filter Name|.ext1;.ext2;.ext3".
      description = filter.substr(0, sep_index);

      const std::string& exts = filter.substr(sep_index + 1);
      size_t last = 0;
      size_t size = exts.size();
      for (size_t i = 0; i <= size; ++i) {
        if (i == size || exts[i] == ';') {
          std::string ext(exts, last, i - last);
          if (!ext.empty() && ext[0] == '.')
            extensions.push_back(ext);
          last = i + 1;
        }
      }
    } else if (filter[0] == '.') {
      // Treat as an extension beginning with the '.' character.
      extensions.push_back(filter);
    } else {
      // Otherwise convert mime type to one or more extensions.
      description = GetDescriptionFromMimeType(filter);

      std::vector<CefString> ext;
      CefGetExtensionsForMimeType(filter, ext);
      for (size_t x = 0; x < ext.size(); ++x)
        extensions.push_back("." + ext[x].ToString());
    }

    if (extensions.empty())
      continue;

    GtkFileFilter* gtk_filter = gtk_file_filter_new();

    std::string ext_str;
    for (size_t x = 0; x < extensions.size(); ++x) {
      const std::string& pattern = "*" + extensions[x];
      if (x != 0)
        ext_str += ";";
      ext_str += pattern;
      gtk_file_filter_add_pattern(gtk_filter, pattern.c_str());
    }

    if (description.empty())
      description = ext_str;
    else
      description += " (" + ext_str + ")";

    gtk_file_filter_set_name(gtk_filter, description.c_str());
    gtk_file_chooser_add_filter(chooser, gtk_filter);
    if (!has_filter)
      has_filter = true;

    filters->push_back(gtk_filter);
  }

  // Add the *.* filter, but only if we have added other filters (otherwise it
  // is implied).
  if (include_all_files && has_filter) {
    GtkFileFilter* filter = gtk_file_filter_new();
    gtk_file_filter_add_pattern(filter, "*");
    gtk_file_filter_set_name(filter, "All Files (*)");
    gtk_file_chooser_add_filter(chooser, filter);
  }
}

static void my_gtk_realize(GtkWidget* widget, gpointer user)
{
    gtk_widget_set_window(widget, (GdkWindow*)user);
}

bool TwinkleHandler::OnFileDialog(
    CefRefPtr<CefBrowser> browser,
    FileDialogMode mode,
    const CefString& title,
    const CefString& default_file_path,
    const std::vector<CefString>& accept_filters,
    int selected_accept_filter,
    CefRefPtr<CefFileDialogCallback> callback) {
  std::vector<CefString> files;

  GtkFileChooserAction action;
  const gchar* accept_button;

  // Remove any modifier flags.
  FileDialogMode mode_type =
     static_cast<FileDialogMode>(mode & FILE_DIALOG_TYPE_MASK);

  fprintf(stderr, "Open File Dialog %d\n", mode_type);

  if (mode_type == FILE_DIALOG_OPEN || mode_type == FILE_DIALOG_OPEN_MULTIPLE) {
    action = GTK_FILE_CHOOSER_ACTION_OPEN;
    accept_button = GTK_STOCK_OPEN;
  } else if (mode_type == FILE_DIALOG_OPEN_FOLDER) {
    action = GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER;
    accept_button = GTK_STOCK_OPEN;
  } else if (mode_type == FILE_DIALOG_SAVE) {
    action = GTK_FILE_CHOOSER_ACTION_SAVE;
    accept_button = GTK_STOCK_SAVE;
  } else {
    NOTREACHED();
    return false;
  }

  std::string title_str;
  if (!title.empty()) {
    title_str = title;
  } else {
    switch (mode_type) {
      case FILE_DIALOG_OPEN:
        title_str = "Open File";
        break;
      case FILE_DIALOG_OPEN_MULTIPLE:
        title_str = "Open Files";
        break;
      case FILE_DIALOG_OPEN_FOLDER:
        title_str = "Open Folder";
        break;
      case FILE_DIALOG_SAVE:
        title_str = "Save File";
        break;
      default:
        break;
    }
  }

  // Create gtk window from a native XWindow ID
  ::Window window = browser->GetHost()->GetWindowHandle();
  DCHECK(window != kNullWindowHandle);

  GdkDisplay* gd = gdk_display_get_default();
  
  GdkWindow *gdkwin = gdk_window_foreign_new_for_display(gd,window);
  GtkWidget *gtkwin = gtk_widget_new(GTK_TYPE_WINDOW, NULL);
  g_signal_connect(gtkwin, "realize", G_CALLBACK(my_gtk_realize), gdkwin);
  gtk_widget_set_has_window(gtkwin, TRUE);
  gtk_widget_realize(gtkwin);

  GtkWidget* dialog = gtk_file_chooser_dialog_new(
      title_str.c_str(),
      GTK_WINDOW(gtkwin),
      action,
      GTK_STOCK_CANCEL, GTK_RESPONSE_CANCEL,
      accept_button, GTK_RESPONSE_ACCEPT,
      NULL);
  
  if (mode_type == FILE_DIALOG_OPEN_MULTIPLE)
    gtk_file_chooser_set_select_multiple(GTK_FILE_CHOOSER(dialog), TRUE);

  if (mode_type == FILE_DIALOG_SAVE) {
    gtk_file_chooser_set_do_overwrite_confirmation(
        GTK_FILE_CHOOSER(dialog),
        !!(mode & FILE_DIALOG_OVERWRITEPROMPT_FLAG));
  }

  gtk_file_chooser_set_show_hidden(GTK_FILE_CHOOSER(dialog),
                                   !(mode & FILE_DIALOG_HIDEREADONLY_FLAG));

  if (!default_file_path.empty() && mode_type == FILE_DIALOG_SAVE) {
    const std::string& file_path = default_file_path;
    bool exists = false;

    struct stat sb;
    if (stat(file_path.c_str(), &sb) == 0 && S_ISREG(sb.st_mode)) {
      // Use the directory and name of the existing file.
      gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dialog),
                                    file_path.data());
      exists = true;
    }

    if (!exists) {
      // Set the current file name but let the user choose the directory.
      std::string file_name_str = file_path;
      const char* file_name = basename(const_cast<char*>(file_name_str.data()));
      gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), file_name);
    }
  }

  std::vector<GtkFileFilter*> filters;
  AddFilters(GTK_FILE_CHOOSER(dialog), accept_filters, true, &filters);
  if (selected_accept_filter < static_cast<int>(filters.size())) {
    gtk_file_chooser_set_filter(GTK_FILE_CHOOSER(dialog),
                                filters[selected_accept_filter]);
  }

  bool success = false;
  if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
    if (mode_type == FILE_DIALOG_OPEN || mode_type == FILE_DIALOG_OPEN_FOLDER ||
        mode_type == FILE_DIALOG_SAVE) {
      char* filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
      files.push_back(std::string(filename));
      success = true;
    } else if (mode_type == FILE_DIALOG_OPEN_MULTIPLE) {
      GSList* filenames =
          gtk_file_chooser_get_filenames(GTK_FILE_CHOOSER(dialog));
      if (filenames) {
        for (GSList* iter = filenames; iter != NULL;
             iter = g_slist_next(iter)) {
          std::string path(static_cast<char*>(iter->data));
          g_free(iter->data);
          files.push_back(path);
        }
        g_slist_free(filenames);
        success = true;
      }
    }
  }

  int filter_index = selected_accept_filter;
  if (success) {
    GtkFileFilter* selected_filter =
        gtk_file_chooser_get_filter(GTK_FILE_CHOOSER(dialog));
    if (selected_filter != NULL) {
      for (size_t x = 0; x < filters.size(); ++x) {
        if (filters[x] == selected_filter) {
          filter_index = x;
          break;
        }
      }
    }
  }

  gtk_widget_destroy(dialog);

  // FIXME crash 
  //gtk_widget_destroy(gtkwin);

  if (success)
    callback->Continue(filter_index, files);
  else
    callback->Cancel();

  return true;
}
