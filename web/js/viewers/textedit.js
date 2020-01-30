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

registerViewer('textedit', {
    name: 'Text Editor',
    embed: function(note, path) {
        var v = this;
        var el = document.createElement('blockquote');
        el.className = "embed";
        loadUrlResource(path, function(data) {
            const maxlen = 180;
            if (data.length < maxlen) {
                el.textContent = data;
            } else {
                el.textContent = data.substring(0, maxlen);
                var a = document.createElement('a');
                a.innerHTML = '&nbsp;&raquo;&nbsp;';
                el.appendChild(a);
            }
            el.onclick = function() {
                var viewer = v.space.openViewer({
                    'type': 'textedit',
                    url: path,
                    readonly: v.data.type != 'note'
                }, v);
                if (note && note.replaceText) {
                    viewer.on('did-save', function(newPath) {
                        note.replaceText(path, newPath);
                    });
                }
            };
        });
        return el;
    },
    load: function () {
        const v= this;
        const vc = cloneTemplate('tpl-textedit');
        if (v.data.url) {
	    loadUrlResource(v.data.url, function(x) {
                vc.find('#editor').value = x;
	    });
        }
        if (!v.data.readonly) {
            v.toolbar.addButton(_t("save"), function() {
                var str = vc.find('#editor').value;
                if (str.length > 0) {
                    var blob = new Blob([str], {
                        type: 'text/plain'
                    });
                    uploadData(v, blob, function(path) {
                        v.dispatch('did-save', path);
                        v.close();
                    });
                }
            });
        }
        return vc;
    }
});

registerViewer('text', 'textedit');

