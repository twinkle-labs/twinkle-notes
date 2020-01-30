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

function GridView(viewer, items, options)
{
    var self = this;
    self.container = document.createElement('div');
    self.container.className = 'grid-list';

    items.forEach(function(item) {
	var el = document.createElement('div');
	el.className = 'grid-item';
	if (item.image) {
	    var img = document.createElement('img');
	    img.setAttribute('src', item.image);
	    el.appendChild(img);
	}
	else if (item.icon) {
	    var i = document.createElement('i');
	    i.className = "fa fa-" + item.icon;
	    i.setAttribute('aria-hidden', true);
	    el.appendChild(i);
	}
	var elTitle = document.createElement('div');
	elTitle.textContent = item.title;
	elTitle.className = 'grid-item-title';
	el.appendChild(elTitle);
	el.onclick = function(e) {
	    if (options && options.didItemSelected) {
		options.didItemSelected(item);
	    }
	};
        if (item.created) {
            item.created(el);
        }
	self.container.appendChild(el);
    });
}

registerViewer('launcher', {
    name: "Launching",
    load: function() {
	var v = this;
	v.setTitle(_t('Home'));
	var contentElement = document.createElement('div');
	contentElement.className = 'launcher';
	var items = [];
        var mux = app.mux;


        function createDotIndicator(type) {
            var indicator = document.createElement('span');
            indicator.className = 'dot-indicator ' + type;
            indicator.innerHTML = '&#8226;';
            return indicator;
        }


	if (app.mux && app.mux.currentUser) {
	    var u = app.mux.currentUser;
	    items.push({
	        image: getDisplayAvatar(app.mux.currentUser),
		title: _t('Me'),
		vdata: {
		    type: 'user',
		    uuid: u.uuid
		},
                created: function(el) {
                    el.find('img').classList.add('avatar');
                }
	    });
	}

	items.push({
	    icon: 'users',
	    title: _t('Friends'),
	    vdata: {
		type: 'users'
	    }
	});

        if (mux.isOwner()) {
	    items.push({
	        icon: 'comments',
	        title: _t('Chats'),
	        vdata: {
		    type: 'chat-list',
	        },
                created: function(el) {
                    mux.request('space', ['count-unread-chats'], function(x){
                        if (x > 0) {
                            el.find('.grid-item-title').prepend(createDotIndicator('text-success'));
                        }
                    });
                }
	    });
        }
        
	items.push({
	    icon: 'folder',
	    title: _t('Files'),
	    vdata: {
		type: 'dir'
	    }
	});

	items.push({
	    icon: 'wallet',
	    title: _t('Ledgers'),
	    vdata: {
		type: 'ledgers'
	    }
	});
        
	items.push({
	    icon: 'pen',
	    title: _t('Write'),
	    vdata: {
		type: 'note',
		mode: 'add-root'
	    }
	});

	items.push({
	    icon: 'search',
	    title: _t('Search'),
	    vdata: {
		type: 'note-search'
	    }
	});
	items.push({
	    icon: 'sync',
	    title: _t('Sync'),
	    vdata: {
		type: 'space-sync'
	    }
	
	});

        if (mux.isOwner()) {
	    items.push({
	        icon: 'paper-plane',
	        title: _t('Outbox'),
	        vdata: {
		    type: 'space-post'
	        },
                created: function(el) {
                    mux.request('space', ['count-unsent-total'], function(x) {
                        if (x > 0) {
                            el.find('.grid-item-title').prepend(createDotIndicator('text-danger'));
                        }
                    })
                }
	    });
        }
        
	items.push({
	    icon: 'calculator',
	    title: _t('Calc'),
	    vdata: {
		type: 'calc'
	    }
	});

        if (mux.currentUser.uuid==mux.currentSpace.uuid) {
	    items.push({
	        icon: 'money-check',
	        title: _t('Billing'),
                vdata: {
                    type: 'space-billing'
                }
	    });
        }

	items.push({
	    icon: 'boxes',
	    title: _t('Spaces'),
	    vdata: {
		type: 'space-list'
	    }
	});
        
	items.push({
	    icon: 'cog',
	    title: _t('Settings'),
	    vdata: {
		type: 'settings'
	    }
	});


        items.push({
            icon: 'chart-line',
            title: _t('Dashboard'),
            vdata: {
                type: 'dashboard'
            }
        });
        
	var gridView = new GridView(v, items, {
	    didItemSelected: function(item) {
		if (item.vdata) {
		    v.space.openViewer(item.vdata, v);
		    v.close();
		}
	    }
	});	
	contentElement.appendChild(gridView.container);

	v.toolbar.addButton(_t("exit"), function(){
	    v.space.openViewer({
		type: 'space-exit'
	    },v);
	    v.close();
	});
	return contentElement;
    }
});
