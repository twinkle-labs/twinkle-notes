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

function createHelpNote(v, path)
{
    var el = document.createElement('div');
    el.className = 'note-content';
    loadUrlResource('/help/'+path, function(x) {
	renderNote(parseNote(x), el, {viewer:v});
    });
    return el;
}

registerViewer('help', {
    name: 'Help',
    embed: function(note,path,name) {
	var el = document.createElement('a');
	el.href='#';
	if (name) {
	    el.textContent = name;
	} else {
	    el.textContent = "help:"+path;
	}
	el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            note.viewer.space.openViewer({
                type: 'help',
		path: path
            }, note.viewer);
	};
	return el;
    },
    load: function() {
	var v = this;
	var path = v.data.path?v.data.path:'index';

	var vc = cloneTemplate('tpl-help', {
            title: path
        });

	var noteElement = vc.find('.note-content');
	loadUrlResource(_t('HELP_ROOT')+'help/'+path, function(x) {
	    renderNote(parseNote(x), noteElement, {viewer:v});
	});
	return vc;
    }
});
    
