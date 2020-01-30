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

registerViewer('switcher', {
    load: function() {
        var v = this;
        v.setTitle(_t("Switch Center"));


        var elContent = document.createElement("div");
        elContent.className = "switcher";
        
        var p = v.space.container;
        var mainWidth = p.clientWidth;
        var mainHeight = p.clientHeight;

        v.createThumb = function(el) {
            var thumb = cloneTemplate('tpl-thumbview');
            var content = thumb.find('.thumbview-content');
            content.style.width = mainWidth + "px";
            content.style.height = mainHeight + "px";
            content.appendChild(el);

            var overlay = thumb.find(".thumbview-overlay");
            thumb.style.width = (mainWidth/8*3) + "px";
            thumb.style.height = (mainHeight/8*3) + "px";
            thumb.cell = el.cell;
            thumb.onclick = function() {
                if (isSelecting()) {
                    if (thumb.classList.contains('active')) {
                        thumb.classList.remove('active');
                    } else {
                        thumb.classList.add('active');
                        thumb.selectedTime = (new Date()).getTime();
                    }
                    var items = getSelectedItems();
                    btnMerge.disabled = !(items.length > 1);
                } else {
                    v.space.bringToFront(el.cell);
                }
            };

            var btnClose = overlay.find(".close");
            btnClose.onclick = function() {
                elContent.removeChild(thumb);
                v.space.removeStashedCell(thumb.cell);
                thumb.cell.kill();
            };
            
            return thumb;
        };


        v.toolbar.addIconButton("rocket", function() {
	    v.space.openViewer({type:'launcher'}, 'top');
        },null, 'launch');

        var btnSelect = v.toolbar.addButton("select", function() {
            if (btnSelect.classList.contains('active')) {
                btnSelect.classList.remove('active');
                btnMerge.disabled = true;
                elContent.childNodes.forEach(function(el) {
                    el.classList.remove('active');
                });
            } else {
                btnSelect.classList.add('active');
            }
        });

        function getSelectedItems() {
            var items = [];
            elContent.childNodes.forEach(function(el) {
                if (el.classList.contains('active')) {
                    items.push(el);
                }
            });
            return items.sort(function(a,b) {
                return a.selectedTime - b.selectedTime;
            });
        }

        function isSelecting() {
            return btnSelect.classList.contains('active');
        }

        var btnMerge = v.toolbar.addButton("merge", function() {
            var items = getSelectedItems();
            if (items.length > 1) {
                var newcell = v.space.mergeCells(items.map(function(x){return x.cell}));
                v.space.bringToFront(newcell);
            }
        });

        btnMerge.disabled = true;
        return elContent;
    },

    mounted: function() {
	var v = this;
        v.space.backViewers.forEach(function(cell) {
            v.contentElement.appendChild(v.createThumb(cell.container));
	    cell.dispatch('mounted');
        });
    }
});
