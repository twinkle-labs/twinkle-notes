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

/*

every 10 changes we need to send snapshots,
so that we can make sure it's always possible
to reconstruct the whole thing.
or we should contact the person in offline to ask 
for a copy.

Local changes:



*/

registerViewer('writer', {
    load: function() {
	var v = this;
	var version_id = 0;

	v.setTitle('Sample Document');
	var elContent = document.createElement('div');
	elContent.className = 'writer';
	var placeholder = document.createElement('div');
	elContent.appendChild(placeholder);

	v.quill = new Quill(placeholder, {
	    modules: {
		formula: true
	    },
	    placeholder: "Write down your thoughts...",
	    bounds: v.container,
	    theme: 'snow'
	});


	return elContent;
    },
    loaded: function() {
	var v = this;
    }
});
