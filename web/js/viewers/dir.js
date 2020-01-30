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

function getFileIcon(x)
{
    if (x.isdir)
        return "fa-folder";
    if (x.type) {
        if (x.type.indexOf("image")==0) {
            return "fa-file-image";
        } else if (x.type.indexOf("audio")==0) {
            return "fa-file-audio";
        } else if (x.type.indexOf("video")==0) {
            return "fa-file-video";
        } else if (x.type.indexOf("text")==0) {
            return "fa-file-alt";
        }
    }
    var ext = x.name.substr(x.name.lastIndexOf('.') + 1);
    switch (ext) {
    case 'ppt': case 'pptx':
        return "fa-file-powerpoint";
    case 'doc': case 'docx':
        return "fa-file-word";
    case 'xls': case 'xlsx':
        return "fa-file-excel";
    case 'pdf':
        return "fa-file-pdf";
    case 'txt':
        return "fa-file-alt";
    case 'zip': case 'rar': case 'gz': case '7z':
        return "fa-file-archive";
    default:
        return "fa-file";
    }
}

function exportFile(x)
{
    var url = '/blob/'+x.blobhash;
    var q = encodeQueryParams({
        name: x.name,
        "access-token": getCookie('access-token')
    });
    var a = document.createElement('A');
    a.href = url + "?" + q;
    a.download = x.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function openFileViewer(v, x)
{
    if (x.type) {
        if (x.type.indexOf("text")==0) {
            v.space.openViewer({
                type: 'textedit',
                name: x.name,
                url: '/blob/'+x.blobhash
            }, v);
            return;
        } else if (x.type.indexOf("image")==0) {
            v.space.openViewer({
                type: 'image',
                name: x.name,
                url: '/blob/'+x.blobhash
            }, v);
            return;
        } else if (x.type.indexOf("video")==0) {
            v.space.openViewer({
                type: 'video',
                videoType: x.type,
                url: '/blob/'+x.blobhash
            }, v);
            return;
        } else if (x.type.indexOf("audio")==0) {
            v.space.openViewer({
                type: 'audio',
                audioType: x.type,
                url: '/blob/'+x.blobhash
            }, v);
            return;
        }
    }

    var ext = x.name.substr(x.name.lastIndexOf('.') + 1);
    switch (ext) {
    case 'mp4': case 'mp3': case 'wav':
        v.space.openViewer({
            type: 'video',
            videoType: 'video/mp4',
            url: '/blob/'+x.blobhash
        }, v);
        break
    case 'pdf':
        v.space.openViewer({
            type: 'pdfviewer',
            name: x.name.substr(0, x.name.lastIndexOf('.')),
            path: '/blob/'+x.blobhash
        }, v);
        break;
    case 'txt':
        v.space.openViewer({
            type: 'textedit',
            name: x.name,
            url: '/blob/'+x.blobhash
        }, v);
        return;

    default:
        {
            var dlg = cloneTemplate('tpl-dir-open-unknown-file');
            dlg.find('#open-as-text').onclick=function(){
                v.dismissModal();
                v.space.openViewer({
                    type: 'textedit',
                    name: x.name,
                    url: '/blob/'+x.blobhash
                }, v);
            };
            dlg.find('#export').onclick = function() {
                v.dismissModal();
                exportFile(x);
            };
            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        }
        break;
    }
}

registerViewer('dir', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-dir');
        const hash = v.data.hash || "";
        v.setTitle(v.data.name||'');
        const elList = vc.find('.dir-listing');
        var selectMode = false;
        var selectedItems = [];
        function onSelectionChange() {
            selectedItems = [];
            elList.querySelectorAll('.list-item').forEach(function(x){
                if (x.find('.check-input').checked) {
                    selectedItems.push(x);
                }
            });
           // console.log("selected:", selectedItems.length);
            btnDelete.disabled = true;
            btnMove.disabled = true;
            btnRename.disabled = true;
            btnExport.disabled = true;
            if (selectedItems.length > 0) {
                btnDelete.disabled = false;
                btnMove.disabled = false;
            }
            if (selectedItems.length == 1) {
                btnRename.disabled = false;
                if (!selectedItems[0].data.isdir) {
                    btnExport.disabled = false;
                }
            }
        }

        function findItem(name) {
            var a = elList.querySelectorAll('.list-item');
            for (var i = 0; i < a.length; i++) {
                if (a[i].data.name == name)
                    return a[i].data;
            }
            return null;
        }
        
        function loadFiles() {
            elList.empty();
            v.space.mux.request('space', [
                'list-files',
                hash,
                0,
                100], function(r) {
                    if (r.error) {
                        app.err(r.error);
                        return;
                    }
                    vc.find('#count').textContent = r[0];
                    r[1].forEach(function(x){
                        var el = cloneTemplate('tpl-dir-item');
                        el.data = x;
                        el.find('#title').textContent = x.name;
                        if (!x.isdir) {
                            el.find('#size').textContent = humanFileSize(x.size);
                        }
                        el.find('#icon').classList.add(getFileIcon(x));
                        el.find('.check-input').onclick = function(e) {
                            e.stopPropagation();
                        };
                        el.find('.check-input').onchange = function(e) {
                            onSelectionChange();
                        };
                        el.onclick = function() {
                            if (selectMode) {
                                var y = el.find('.check-input');
                                y.checked = !y.checked;
                                onSelectionChange();
                            } else if (x.isdir) {
                                v.space.openViewer({
                                    type: 'dir',
                                    name: x.name,
                                    hash: x.hash
                                }, v);
                            } else {
                                openFileViewer(v, x);
                            }
                        };
                        elList.appendChild(el);
                    });
                });
        }
        var btnAddFile = v.toolbar.addButton(_t('+file'), function() {
            var viewer = v.space.openViewer({
                type: 'filechooser'
            }, v);
            viewer.on('did-upload', function(path, file) {
                var x = findItem(file.name);
                if (x) {
                    if (x.isdir) {
                        app.err("folder with same name");
                        return;
                    } else {
                        var blobhash = path.substring(6);
                        v.space.mux.request('space!', [
                            'update-file',
                            x.hash,
                            blobhash
                        ], function(r) {
                            if (r.error) {
                                app.err(r.error);
                                return;
                            }
                            loadFiles();
                        });
                    }
                } else {
                    var blobhash = path.substring(6);
                    v.space.mux.request('space!', [
                        'add-file',
                        hash,
                        file.name || blobhash,
                        blobhash
                    ], function(r) {
                        if (r.error) {
                            app.err(r.error);
                            return;
                        }
                        loadFiles();
                    });
                }
            });
        });
        var btnAddFolder = v.toolbar.addButton(_t('+folder'), function() {
            v.showPrompt({title:"New folder"}, function(name){
                var x = findItem(name);
                if (x) {
                    app.err("folder already exists");
                    return;
                }
                v.space.mux.request('space!', [
                    'add-folder',
                    hash,
                    name.trim()
                ], function(r) {
                    if (r.error) {
                        app.err(r.error);
                        return;
                    }
                    loadFiles();
                });
            });
        });


        var btnDelete = v.toolbar.addIconButton('trash-alt', function() {
            v.showConfirm({title:"Delete " + selectedItems.length + " items?"}, function(ok) {
                if (ok) {
                    selectedItems.forEach(function(el) {
                        v.space.mux.request('space!', [
                            'remove-file',
                            el.data.hash
                        ], function(r) {
                            if (!r||r.error) {
                                app.err("Can not remove");
                            } else {
                                el.parentNode.removeChild(el);
                            }
                        });
                    });
                }
            });
        });
        
        var btnExport = v.toolbar.addButton(_t('export'), function() {
            var el = selectedItems[0];
            exportFile(el.data);
        });

        var btnRename = v.toolbar.addButton(_t('rename'), function() {
            var el = selectedItems[0];
            v.showPrompt({
                title: "Enter new name",
                text: el.data.name
            }, function(result) {
                if (!result)
                    return;
                v.space.mux.request('space!', [
                    'rename-file',
                    el.data.hash,
                    result
                ], function(r) {
                    if (r.error) {
                        app.err(r.error);
                    } else {
                        el.find('#title').textContent = result;
                        el.find('.check-input').checked = false;
                        onSelectionChange();
                    }
                });
            });
                
        });
        var btnMove = v.toolbar.addButton(_t('move'), function() {
            var viewer = v.space.openViewer({
                type: 'dir-chooser'
            }, v);
            viewer.on('did-choose', function(x) {
                if (x == v.data.hash) {
                    app.err("Same folder");
                    return;
                }
                selectedItems.forEach(function(el) {
                    v.space.mux.request('space!', [
                        'move-file',
                        el.data.hash,
                        x
                    ], function(r) {
                        if (!r||r.error) {
                            app.err("Can not move");
                        } else {
                            el.parentNode.removeChild(el);
                        }
                    });
                });
            });
        });
        btnDelete.classList.add('hidden');
        btnRename.classList.add('hidden');
        btnMove.classList.add('hidden');
        btnExport.classList.add('hidden');

        var btnSelect = v.toolbar.addButton(_t('select'), function() {
            if (selectMode) {
                elList.classList.remove('select-mode');
                elList.querySelectorAll('input[type="checkbox"]').forEach(function(x){
                    x.checked = false;
                });
                btnSelect.classList.remove('active');
            } else {
                elList.classList.add('select-mode');
                btnSelect.classList.add('active');
            }
            onSelectionChange();
            selectMode = !selectMode;
            refreshToolbar();
        });
        
        function refreshToolbar() {
            if (selectMode) {
                btnAddFolder.classList.add('hidden');
                btnAddFile.classList.add('hidden');
                btnDelete.classList.remove('hidden');
                btnRename.classList.remove('hidden');
                btnMove.classList.remove('hidden');
                btnExport.classList.remove('hidden');
            } else {
                btnAddFolder.classList.remove('hidden');
                btnAddFile.classList.remove('hidden');
                btnDelete.classList.add('hidden');
                btnRename.classList.add('hidden');
                btnMove.classList.add('hidden');
                btnExport.classList.add('hidden');
            }
        }

        loadFiles();
        return vc;
    }

});

registerViewer('dir-chooser', {
    load: function() {
        const v = this;

        const vc = cloneTemplate('tpl-dir-chooser');
        const elList = vc.find('.list-plain');
        const chooseFile = v.data.chooseFile;
        var dirStack = [];
        var currpath = "/";
        if (chooseFile)
            v.setTitle(_t('Choose file'));
        else
            v.setTitle(_t('Choose folder'));
        function loadFiles() {
            elList.empty();
            var hash = dirStack.length > 0? dirStack[dirStack.length-1].hash : '';
            vc.find('#path').textContent = currpath;
            v.space.mux.request('space', [
                'list-files',
                hash,
                0,
                100], function(r) {
                    if (r.error) {
                        app.err(r.error);
                        return;
                    }
                    var n = 0;

                    r[1].forEach(function(x){
                        if (!x.isdir && !chooseFile)
                            return;
                        n++;
                        var el = cloneTemplate('tpl-dir-item');
                        el.data = x;
                        el.find('#title').textContent = x.name;
                        if (!x.isdir) {
                            el.find('#size').textContent = humanFileSize(x.size);
                        }
                        el.find('#icon').classList.add(getFileIcon(x));
                        el.onclick = function() {
                            if (x.isdir) {
                                x.parentPath = currpath;
                                currpath += x.name + "/";
                                dirStack.push(x);
                                loadFiles();
                            } else {
                                onChooseFile(x);
                            }
                        };
                        elList.appendChild(el);
                    });

                    vc.find('#count').textContent = n;                    
                });
        }

        function onChooseDir(x) {
            console.log('onChooseDir:' + currpath + " " + x);
            v.dispatch('did-choose', x);
            v.close();
        }

        var btnUp = v.toolbar.addButton(_t("up"), function() {
            if (dirStack.length > 0)
                currpath = dirStack.pop().parentPath;
            loadFiles();
        });
        if (!chooseFile) {
            var btnChoose = v.toolbar.addButton(_t("choose"), function() {
                if (dirStack.length == 0)
                    onChooseDir("");
                else
                    onChooseDir(dirStack[dirStack.length-1].hash);
            });
        }
        var btnCancel = v.toolbar.addButton(_t("cancel"), function() {
            v.close();
        });

        loadFiles();
        return vc;
    }
});
