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

registerViewer('settings', {
    load: function() {
        var v = this;
        var vc = cloneTemplate('tpl-settings', {version: app.version});

        vc.querySelector('#export').onclick = function() {
            v.space.openViewer({
                type: 'space-export'
            }, v);
        };
        vc.find('#theme').onclick = function() {
            v.space.openViewer({type:'settings-theme'},v);
        };
        vc.find('#lang').onclick = function() {
            v.space.openViewer({type:'settings-language'},v);
        };

        vc.find('#change-password').onclick = function() {
            v.space.openViewer({type:'settings-change-password'},v);
        };
        vc.find('#usage').onclick = function() {
            v.space.openViewer({type:'space-usage'},v);
        };
        return vc;
    }
});

registerViewer('settings-change-password', {
    load: function() {
        const v = this;

        const vc = cloneTemplate('tpl-settings-change-password');

        var btnUpdate = vc.find('#update');
        var oldPass = vc.find('#oldpass');
        var pass1 = vc.find('#pass1');
        var pass2 = vc.find('#pass2');
        btnUpdate.onclick = function() {
            if (!oldPass.value.trim() || pass1.value != pass2.value ||
                pass1.value.length < 6)
            {
                app.err("Invalid input");
                return;
            }
            btnUpdate.disabled = true;
            httpGetSEXP('/api/spaces/update-passphrase', {
                oldpass: oldPass.value.trim(),
                newpass: pass1.value.trim()
            }, function(r) {
                btnUpdate.disabled = false;
                if (r.success) {
	            app.removeKey();
	            window.location.reload();
                } else {
                    app.err("Failed:" + r.error);
                }
            });
        };
        return vc;
    }
});

registerViewer('settings-theme', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-settings-theme');
        var themeList = vc.find('#theme-list');

        themeList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            console.log("Theme selected", el.id);
            localStorage.setItem('Theme', el.id);
            dynload(['/theme/' + (localStorage.getItem('Theme')||'default') + '/style.css'],function(){});
            updateThemeList();
        };
        function updateThemeList() {
            themeList.querySelectorAll('.fa-check').forEach(function(x){
                x.classList.remove('fa-check');
            });
            var curr = localStorage.getItem('Theme')||'default';
            vc.find('#'+curr + ' .fa').classList.add('fa-check');
        }
        updateThemeList();
        return vc;
    }
});

registerViewer('settings-language', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-settings-language');
        var langList = vc.find('#lang-list');

        langList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            console.log("Language selected", el.id);
            localStorage.setItem('Language', el.id);
            updateLangList();
            app.echo("App restart required");
        };
        function updateLangList() {
            langList.querySelectorAll('.fa-check').forEach(function(x){
                x.classList.remove('fa-check');
            });
            var curr = localStorage.getItem('Language')||'default';
            vc.find('#'+curr + ' .fa').classList.add('fa-check');
        }
        updateLangList();
        return vc;
    }
});
