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
 * ledger.js -- A simple ledger application
 * For managing personal financial information.
 */

function BalanceView(units, balance, currency, changeMode)
{
    balance = balance || 0;

    var t = getDisplayableQuantity(balance);
    var el = cloneTemplate('tpl-ledger-balance', {
        balance: (changeMode ? (balance >= 0? '+'+t : t) : t),
        currency: currency
    });

    if (balance < 0)
        el.find('#total').classList.add('text-danger');
    else if (changeMode) {
        el.find('#total').classList.add('text-success');
    }

    var elUnits = el.find('#units');
    units.forEach(function(x) {
        elUnits.appendChild(createQtyView(x.quantity, x.unit_code, changeMode));
    });

    return el;
}

function getDisplayableQuantity(qty)
{
    if (qty != Math.floor(qty))
        return qty.toFixed(2);
    else
        return qty;
}

function createQtyView(qty, unit, changeMode) {
    var el = document.createElement('div');
    el.className = "hgroup";
    var elQty = document.createElement('b');
    if (qty < 0) {
        elQty.className = "text-danger";
        elQty.textContent = getDisplayableQuantity(qty);
    } else if (changeMode) {
        elQty.textContent = '+' + getDisplayableQuantity(qty);
        elQty.className = 'text-success';
    } else {
        elQty.textContent = getDisplayableQuantity(qty);
    }
    elQty.classList.add('text-break-word');
    el.appendChild(elQty);
    var elUnit = document.createElement('small');
    elUnit.textContent = unit;
    el.appendChild(elUnit);
    return el;
}

/*************************************************************/

registerViewer('ledgers', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledgers');
        const lst = vc.find('.list-plain');

        function loadLedgers() {
            lst.empty();
            v.space.mux.request('space', [
                'list-ledgers'
            ], function(u) {
                u.forEach(function(x) {
                    const el = cloneTemplate('tpl-ledger-item', {
                        title: x.name,
                        currency: x.currency
                    });
                    el.onclick = function() {
                        v.space.openViewer({
                            type: 'ledger',
                            ledger: x
                        }, v);
                    };
                    lst.appendChild(el);
                });
            });
        }

        v.toolbar.addIconButton('plus', function() {
            var dlg = cloneTemplate('tpl-ledger-new-dialog');
            dlg.find('#ok').onclick = function() {
                var t = dlg.find('#prompt-input').value.trim();
                v.dismissModal();
                if (!t) {
                    return;
                }
                v.space.mux.request('space!', [
                    'add-ledger',
                    t,
                    dlg.find('#currency').value
                ], function() {
                    loadLedgers();
                });
            };
            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        });
        loadLedgers();
        return vc;
    }

});

/*************************************************************/

registerViewer('ledger', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger', {
            name: v.data.ledger.name || ''
        });
        var loadPos = -1;
        const loadLimit = 100;
        
        v.toolbar.addButton(_t('Accounts'), function() {
            v.space.openViewer({
                type: 'ledger-accounts',
                ledger: v.data.ledger
            }, v);
        });

        v.toolbar.addButton(_t('Units'), function() {
            v.space.openViewer({
                type: 'ledger-units',
                ledger: v.data.ledger
            }, v);
        });
        
        vc.find('#new').onclick = function() {
            v.space.openViewer({
                type:'ledger-transaction-edit',
                ledger: v.data.ledger
            }, v);
        };

        const elList = vc.find('#txs');
        function loadTransactions(limit) {
            if (loadPos < 0) {
                elList.empty();
                loadPos = 100000000;
            }
            v.space.mux.request('space', [
                'list-ledger-transactions',
                v.data.ledger.id,
                loadPos,
                limit
            ], function(u) {
                var total = u[0];
                var txs = u[1];

                if (total == 0 && !elList.lastChild) {
                    vc.find('#tip').classList.remove('collapse');
                }

                if (txs.length == total) {
                    vc.find('#more-txs').classList.add('collapse');
                } else {
                    vc.find('#more-txs').classList.remove('collapse');
                    vc.find('#more-cnt').textContent = total - txs.length;
                }
                
                txs.forEach(function(x){
                    if (x.id < loadPos)
                        loadPos = x.id;
                    var el = cloneTemplate('tpl-ledger-transaction-item',{
                        total: x.total.toFixed(2),
                        txid: x.hash.substring(0,8),
                        currency: v.data.ledger.currency,
                        comment: x.comment.split('\n')[0],
                        ts: moment.unix(x.ctime).fromNow(),
                        photo: x.photo
                    });
                    if (x.status != 1) {
                        el.find('#txid').classList.add('text-strike');
                        el.find('#txid').classList.add('text-muted');
                    }
                    el.item = x;
                    elList.appendChild(el);
                });
            });
        }

        elList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            v.space.openViewer({
                type: 'ledger-transaction',
                hash: el.item.hash
            }, v);
        };

        vc.find('#more').onclick = function() {
            loadTransactions(loadLimit);
        };

        v.space.mux.on('new-transaction', v, function(ledger_hash){
            if (v.data.ledger.hash == ledger_hash) {
                loadPos = -1;
                loadTransactions(loadLimit);
            }
        });

        loadTransactions(loadLimit);
        
        return vc;
    },

    unload: function() {
        const v = this;
        v.space.mux.off('new-transaction', v);
    }

});

/*************************************************************/

registerViewer('ledger-units', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-units');
      var stack = [];
        var elList = vc.find('.list-plain');

        function getCurrentParent() {
            return stack.length==0?false:stack[stack.length-1].hash;
        }
        
        v.toolbar.addIconButton('plus', function() {
            var dlg = cloneTemplate('tpl-ledger-new-unit-dialog');
            dlg.find('#ok').onclick = function() {
                var name = dlg.find('#name').value.trim();
                var code = dlg.find('#code').value.trim();
                v.dismissModal();
                if (!name || !code) {
                    return;
                }
                v.space.mux.request('space!', [
                    'add-ledger-unit',
                    v.data.ledger.hash,
                    code,
                    name,
                    1,
                    getCurrentParent()
                ], function(x) {
                    loadUnits();
                });
            };
            dlg.find('#cancel').onclick = function() {
                v.dismissModal();
            };
            v.showModal(dlg);
        });
        var btnAddGroup = v.toolbar.addIconButton('folder-plus', function() {
            v.showPrompt({
                title: _t("New category")
            }, function(name) {
                v.space.mux.request('space!', [
                    'add-ledger-unit',
                    v.data.ledger.hash,
                    false,
                    name,
                    2,
                    getCurrentParent()
                ], function(x) {
                    loadUnits();
                });
            });
        });

        function getCurrentPath() {
            var path = '';
            for (var i = 0; i < stack.length; i++) {
                if (path) {
                    path += '/' + stack[i].name;
                } else {
                    path = stack[i].name;
                }
            }
            return path;
        }

        function loadUnits() {
            elList.empty();
            if (stack.length > 0) {
                vc.find('#path').textContent = getCurrentPath();
                vc.find('#up').classList.remove('collapse');
            } else {
                vc.find('#path').textContent = '';
                vc.find('#up').classList.add('collapse');
            }
            v.space.mux.request('space', [
                'list-ledger-units',
                v.data.ledger.id,
                getCurrentParent()
            ], function(u) {
                u.sort(function(a,b){
                    return b.type-a.type;
                }).forEach(function(x) {
                    var el = cloneTemplate('tpl-ledger-unit-item', {
                        code: x.code || '',
                        title: x.type==1?x.name:x.name+'/'
                    });
                    el.item = x;
                    elList.appendChild(el);
                });
            });
        }

        vc.find('#up').onclick = function() {
            if (stack.length > 0) {
                stack.pop();
                loadUnits();
            }
        };

        elList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            if (!el)
                return;
            if (el.item.type == 2) {
                stack.push(el.item);
                loadUnits();
            } else if (el.item.type == 1) {
                if (v.data.mode == 'pick') {
                    el.item.path = getCurrentPath();
                    v.dispatch('did-pick', el.item);
                    v.close();
                } else {
                    // Show account page
                }
            }
            return el;
        };

        loadUnits();
        return vc;
    }
});

/*************************************************************/

registerViewer('ledger-accounts', {
    load: function () {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-accounts', {
            
        });
        var stack = [];
        var elList = vc.find('.list-plain');

        if (v.data.mode == 'pick') {
            v.setTitle(_t("Select account"));
        }

        function getCurrentParent() {
            return stack.length==0?false:stack[stack.length-1].hash;
        }
        
        v.toolbar.addIconButton('plus', function() {
            v.showPrompt({
                title: _t("New account")
            }, function(name) {
                v.space.mux.request('space!', [
                    'add-ledger-account',
                    v.data.ledger.hash,
                    name,
                    1,
                    getCurrentParent()
                ], function(x) {
                    loadAccounts();
                });
            });
        });
        var btnAddGroup = v.toolbar.addIconButton('folder-plus', function() {
            v.showPrompt({
                title: _t("New category")
            }, function(name) {
                v.space.mux.request('space!', [
                    'add-ledger-account',
                    v.data.ledger.hash,
                    name,
                    2,
                    getCurrentParent()
                ], function(x) {
                    loadAccounts();
                });
            });
        });

        function getCurrentPath() {
            var path = '';
            for (var i = 0; i < stack.length; i++) {
                if (path) {
                    path += '/' + stack[i].name;
                } else {
                    path = stack[i].name;
                }
            }
            return path;
        }

        function loadAccounts() {
            elList.empty();
            if (stack.length > 0) {
                if (stack.length > 1)
                    vc.find('#parent').textContent = stack[stack.length-2].name;
                else
                    vc.find('#parent').textContent = '';
                vc.find('#name').textContent = stack[stack.length-1].name;
                vc.find('#header').classList.remove('collapse');
            } else {
                vc.find('#parent').textContent = '';
                vc.find('#name').textContent = '';
                vc.find('#header').classList.add('collapse');
            }
            v.space.mux.request('space', [
                'list-ledger-accounts',
                v.data.ledger.id,
                getCurrentParent()
            ], function(u) {
                if (u.length == 0 && stack.length == 0) {
                    vc.find('#wizard').classList.remove('collapse');
                    return;
                }
                vc.find('#wizard').classList.add('collapse');
                u.sort(function(a,b){
                    return b.type-a.type;
                }).forEach(function(x) {
                    var el = cloneTemplate('tpl-ledger-account-item', {
                        title: x.type==1?x.name: x.name+'/'
                    });
                    el.item = x;
                    elList.appendChild(el);
                });
            });
        }

        vc.find('#up').onclick = function() {
            if (stack.length > 0) {
                stack.pop();
                loadAccounts();
            }
        };

        vc.find('#edit').onclick = function() {
            var x = stack[stack.length-1];
            v.showPrompt({
                title: _t("Enter new name"),
                text: x.name
            }, function(result) {
                if (!result)
                    return;
                v.space.mux.request('space!', [
                    'edit-ledger-account',
                    x.hash,
                    result,
                    x.parent_id||0,
                    x.icon||'',
                    x.description||''
                ], function (x) {
                    if (x && !x.error) {
                        x.name = result;
                        vc.find('#name').textContent = result;
                    }
                });
            });
        };

        vc.find('#report').onclick = function() {
            var x = stack[stack.length-1];            
            v.space.openViewer({
                type: 'ledger-account-report',
                account_id: x.id
            }, v);
        };

        elList.onclick = function(e) {
            var el = e.target.closest('.list-item');
            if (!el)
                return;
            if (el.item.type == 2) {
                stack.push(el.item);
                loadAccounts();
            } else if (el.item.type == 1) {
                if (v.data.mode == 'pick') {
                    el.item.path = getCurrentPath();
                    v.dispatch('did-pick', el.item);
                    v.close();
                } else {
                    v.space.openViewer({
                        type: 'ledger-account',
                        ledger: v.data.ledger,
                        account: el.item
                    }, v);
                }
            }
            return el;
        };

        function startWizard(c, i) {
            if (i == c.length) {
                loadAccounts();
                return;
            }
            var el = c[i];
            var name = el.textContent;
            var type = 1;
            if (name.endsWith('/')) {
                type = 2;
                name = name.substring(0, name.length-1);
            }
            var parent = false;
            var j = name.lastIndexOf('/');
            if (j > 0) {
                var t = name.substring(0, j+1);
                name = name.substring(j+1);
                for (var k = 0; k < i; k++) {
                    if (c[k].textContent == t) {
                        parent = c[k].accountHash;
                    }
                }
            }
            v.space.mux.request('space!', [
                'add-ledger-account',
                v.data.ledger.hash,
                name,
                type,
                parent
            ], function(x) {
                el.accountHash = x;
                startWizard(c, i+1);
            });
        }

        vc.find('#create-default').onclick = function() {
            var c = vc.find('#default-accounts').children;
            startWizard(c, 0);
        };

        loadAccounts();
        return vc;
    }
});

/*************************************************************/

registerViewer('ledger-transaction-edit', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-transaction-edit');

        function addRow(a, k) {
            var elDetails = vc.find('#details');
            var el = cloneTemplate('tpl-ledger-transaction-detail');
            el.find('#account').textContent = a.name;
            if (k) {
                el.find('#unit').textContent = k.unit_code;
                el.find('#price').value = k.price;
                el.find('#txdate').value = k.txdate;
                el.find('#quantity').value = k.quantity;
            } else {
                el.find('#unit').textContent = v.data.ledger.currency;
                el.find('#price').value = '1.0';
                el.find('#price').classList.add('collapse');
                if (elDetails.lastChild) {
                    el.find('#txdate').value = elDetails.lastChild.find('#txdate').value;
                } else {
                    el.find('#txdate').value = moment().format('YYYY-MM-DD');
                }
            }

            if (a.path) {
                el.find('#path').textContent = a.path + '/';
            }
            el.item = {account: a};
            el.find('#trash').onclick = function() {
                el.parentNode.removeChild(el);
            };
            el.find('#unit').onclick = function() {
                var viewer = v.space.openViewer({
                    type: 'ledger-units',
                    ledger: v.data.ledger,
                    mode: 'pick'
                });
                viewer.on('did-pick', function(x) {
                    el.find('#unit').textContent = x.code;
                    if (x.code == v.data.ledger.currency) {
                        el.find('#price').value = '1.0';
                        el.find('#price').classList.add('collapse');
                    } else {
                        el.find('#price').value = '';
                        el.find('#price').classList.remove('collapse');
                    }
                });
            };
            elDetails.appendChild(el);
        }

        vc.find('#addrow').onclick = function() {
            var viewer = v.space.openViewer({
                type:'ledger-accounts',
                mode: 'pick',
                ledger: v.data.ledger
            }, v);
            viewer.on('did-pick', function(a) {
                if (a.hash) {
                    addRow(a);
                }
            });
        };

        
        function validate(elDetail) {
            var c = vc.find('#details').children;
            var valid = true;
            var balance = 0;

            function check(el, ok) {
                if (!ok) {
                    el.classList.add('border-danger');
                } else {
                    el.classList.remove('border-danger');
                }
                return ok;
            }

            if (!vc.find('#comment').value.trim()) {
                vc.find('#comment').classList.add('border-danger');
                valid = false;
            }
            
            for (var i = 0; i < c.length; i++) {
                var el = c[i];
                var price = parseFloat(el.find('#price').value) || 0;
                var unit = el.find('#unit').textContent;
                var quantity = parseFloat(el.find('#quantity').value) || 0;
                var txdate = el.find('#txdate').value;
                var bad = false;

                if (!check(el.find('#txdate'), txdate.match(/^\d\d\d\d-\d\d-\d\d$/)))
                    bad = true;
                if (!check(el.find('#price'), price))
                    bad = true;
                if (!check(el.find('#quantity'), quantity))
                    bad = true;

                el.item.value = quantity * price;
                el.item.quantity = quantity;
                el.item.unit = unit;
                el.item.price = price;
                el.item.txdate = txdate;
                balance += el.item.value;
                
                if (bad)
                    valid = false;
            }

            if (Math.abs(balance) >= 0.01) {
                vc.find('#balance').textContent = balance.toFixed(2);
                vc.find('#save').disabled = true;
                valid = false;
            } else if (valid) {
                vc.find('#balance').textContent = '';
                vc.find('#save').disabled = false;
            } else {
                vc.find('#balance').textContent = '';
                vc.find('#save').disabled = true;
            }
            
            return valid;
        }

        vc.find('#save').onclick = function() {
            var c = vc.find('#details').children;
            if (c.length < 2) {
                app.err("At least two entries");
                return;
            }
            if (!validate())
                return;
            
            var req = [
                'add-ledger-transaction',
                v.data.ledger.hash,
                vc.find('#comment').value,
                v.data.tx?v.data.tx.hash:'',
                1
            ];
            var balance = 0;
            for (var i = 0; i < c.length; i++) {
                balance += c[i].item.value;
                req.push(c[i].item.account.hash);
                req.push(c[i].item.unit);
                req.push(c[i].item.quantity);
                req.push(c[i].item.price);
                req.push(c[i].item.txdate);
                req.push(''); // Comment per detail, unused for now
            }

            if (Math.abs(balance) > 0.01) {
                app.err("unbalanced");
                return;
            }
            
            v.space.mux.request('space!', req, function(x) {
                if (x && !x.error) {
                    v.dispatch('did-save', x);
                    v.space.mux.dispatch('new-transaction', [v.data.ledger.hash]);
                    v.close();
                } else {
                    app.err(x.error);
                }
            });
        };

        vc.onchange = function(e) {
            var el = e.target.closest('.txdetail');
            validate(el);
        };


        if (v.data.tx) {
            vc.find('#comment').value = v.data.tx.comment;
            v.data.tx.details.forEach(function(x) {
                addRow({
                    id: x.account_id,
                    name: x.account_name,
                    hash: x.account_hash
                }, x);
            });
        } else {
            v.setTitle(_t('New transaction'));
            vc.find('#tip').classList.remove('collapse');
        }
        
        return vc;
    }

});

/*************************************************************/

registerViewer('ledger-account', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-account', {
            name: v.data.account.name,
            currency: v.data.ledger.currency
        });

        v.space.mux.request('space', [
            'get-account-info',
            v.data.account.id
        ], function(u) {
            var elList = vc.find('#balance');
            elList.empty();
            elList.appendChild(BalanceView(u[2], u[1], v.data.ledger.currency));
            vc.find('#path').textContent = u[3].map(function(x) {
                return x.name + "/";
            }).join('');
            
        });

        function loadTx(start, end) {
            var elList = vc.find('#txs');
            elList.empty();
            v.space.mux.request('space', [
                'list-account-transactions',
                v.data.account.id,
                start,
                end
            ], function(u) {
                var total = 0;
                var units = {};
                u.forEach(function(x) {
                    if (x.status == 1) {
                        total += x.quantity * x.price;
                        if (!units[x.unit_code]) {
                            units[x.unit_code] = {
                                unit_code: x.unit_code,
                                quantity: 0
                            };
                        }
                        units[x.unit_code].quantity += x.quantity;
                    }
                    var el = cloneTemplate('tpl-ledger-account-transaction-item', {
                        txid: x.txhash.substring(0,8),
                        txdate: x.txdate,
                        comment: x.comment || '',
                        quantity: x.quantity,
                        unit_code: x.unit_code
                    });
                    el.item = x;
                    if (!x.status) {
                        el.find('#txid').classList.add('text-strike');
                    }
                    elList.appendChild(el);
                });

                var t = vc.find('#balance-change');
                t.empty();
                t.appendChild(BalanceView( Object.values(units),total,
                                          v.data.ledger.currency,
                                          true));
                
            });
        }

        vc.find('#txs').onclick = function(e) {
            var el = e.target.closest('.list-item');
            v.space.openViewer({
                type: 'ledger-transaction',
                hash: el.item.txhash
            }, v);
        };

        vc.find('#start').value = moment().subtract(3, 'months').format('YYYY-MM-DD');
        vc.find('#end').value = moment().format('YYYY-MM-DD');
        loadTx(vc.find('#start').value, vc.find('#end').value);

        vc.find('#find').onclick = function() {
            var start = vc.find('#start').value;
            var end = vc.find('#end').value;
            loadTx(start||'0000-00-00', end || moment().format('YYYY-MM-DD'));
        };

        vc.find('#range').onchange = function(e) {
            var start, end;
            switch (e.target.value) {
            case '1mo':
                start = moment().subtract(1, 'months').startOf('month');
                end = moment().subtract(1, 'months').endOf('month');
                break;
            case '3mo':
                start = moment().subtract(3, 'months').startOf('month');
                end = moment().subtract(1, 'months').endOf('month');
                break;
            case '6mo': 
                start = moment().subtract(6, 'months').startOf('month');
                end = moment().subtract(1, 'months').endOf('month');
                break;
            case '1yr':
                start = moment().subtract(1, 'years').startOf('year');
                end = moment().subtract(1, 'years').endOf('year');
                break;
            case '5yr': 
                start = moment().subtract(5, 'years').startOf('year');
                end = moment().subtract(1, 'years').endOf('year');
                break;
            case 'recent':
            default:
                start = moment().subtract(3, 'months');
                end = moment();
                break;
            }
            vc.find('#start').value = start.format('YYYY-MM-DD');
            vc.find('#end').value = end.format('YYYY-MM-DD');
            loadTx(vc.find('#start').value, vc.find('#end').value);
        };

        vc.find('#edit').onclick = function() {
            v.showPrompt({
                title: "Enter new name",
                text: v.data.account.name
            }, function(result) {
                if (!result)
                    return;
                v.space.mux.request('space!', [
                    'edit-ledger-account',
                    v.data.account.hash,
                    result,
                    v.data.account.parent_id||0,
                    v.data.account.icon||'',
                    v.data.account.description||''
                ], function (x) {
                    if (x && !x.error) {
                        v.data.account.name = result;
                        v.reload();
                    }
                });
            });
        };

        v.toolbar.addIconButton('chart-bar', function() {
            v.space.openViewer({
                type: 'ledger-account-report',
                account_id: v.data.account.id
            }, v);
        });
        
        return vc;
    }
});

/*************************************************************/

registerViewer('ledger-transaction', {
    embed: function(note,hash) {
        var el = document.createElement('a');
        el.textContent = "TX:" + hash;
        el.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            note.viewer.space.openViewer({
                type: 'ledger-transaction',
                hash: hash
            }, note.viewer);
        };
        return el;
    },
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-transaction', {
            txid: v.data.hash.substring(0,8)
        });
        var tx;
        v.space.mux.request('space', [
            'find-ledger-transaction',
            v.data.hash
        ], function(x) {
            tx = x;
            vc.find('#ledger').textContent = x.ledger_name;
            vc.find('#photo').src = x.photo;
            vc.find('#ts').textContent = moment.unix(x.ctime).format("lll");
            vc.find('#total').textContent = getDisplayableQuantity(x.total);
            renderNote(parseNote(x.comment), vc.find('#comment'), {viewer:v});
            vc.find('#currency').textContent = x.ledger_currency;

            if (x.next_hash) {
                vc.find('#txid').classList.add('text-strike');
                vc.find('#updated-hash').textContent = x.next_hash.substring(0,8);
                vc.find('#updated-by').classList.remove('collapse');
            }

            if (x.origin_hash) {
                vc.find('#origin-hash').textContent = x.origin_hash.substring(0,8);
                vc.find('#origin').classList.remove('collapse');
            }
            
            v.space.mux.request('space', [
                'get-transaction-detail',
                x.id
            ], function(y) {
                var d = vc.find('#detail');
                tx.details = y;
                if (y.length > 0 && x.status == 1)
                    vc.find('#action').classList.remove('collapse');
                y.forEach(function(z){
                    var item = cloneTemplate('tpl-ledger-txdetail',{
                        account: z.account_name,
                        account_id: z.account_id,
                        unit: z.unit_code,
                        quantity: getDisplayableQuantity(z.quantity),
                        value: getDisplayableQuantity(z.quantity * z.price),
                        price: z.price,
                        currency: x.ledger_currency,
                        txdate: z.txdate
                    });
                    if (z.quantity < 0)
                        item.find('#qty').classList.add('text-danger');
                    if (z.unit_code != x.ledger_currency) {
                        item.find('#price').classList.remove('collapse');
                    }
                    item.onclick = function() {
                        v.space.openViewer({
                            type: 'ledger-account',
                            ledger: {
                                currency: x.ledger_currency
                            },
                            account: {
                                name: z.account_name,
                                id: z.account_id
                            }
                        }, v);
                    };
                    d.appendChild(item);
                });
            });
        });

        vc.find('#cancel-tx').onclick = function() {
            v.showPrompt({
                title: 'Comment',
                text: _t("Cancel") + ' [tx:' + tx.hash.substring(0,8) + ']'
            }, function(result) {
                if (!result)
                    return;
                v.space.mux.request('space', [
                    'cancel-ledger-transaction',
                    result,
                    tx.hash
                ], function(u) {
                    v.reload();
                });
            });
        };

        vc.find('#edit-tx').onclick = function() {
            var viewer = v.space.openViewer({
                type: 'ledger-transaction-edit',
                tx: tx,
                ledger: {
                    id: tx.ledger_id,
                    hash: tx.ledger_hash,
                    name: tx.ledger_name,
                    currency: tx.ledger_currency
                }
            }, v);

            viewer.on('did-save', function(hash) {
                v.data.hash = hash;
                v.reload();
            });
        };

        vc.find('#ledger').onclick = function() {
            var viewer = v.space.openViewer({
                type: 'ledger',
                ledger: {
                    id: tx.ledger_id,
                    hash: tx.ledger_hash,
                    name: tx.ledger_name,
                    currency: tx.ledger_currency
                }
            }, v);
        };
        
        vc.find('#updated-hash').onclick = function() {
            v.space.openViewer({
                type: 'tx',
                hash: tx.next_hash
            }, v);
        };

        vc.find('#origin-hash').onclick = function() {
            v.space.openViewer({
                type: 'tx',
                hash: tx.origin_hash
            }, v);
        };
        
        return vc;
    }
});

registerViewer('tx', 'ledger-transaction');

function createChartStat(ctx, unit, title, labels, data)
{
    var options = {};

    return new Chart(ctx, {
        // The type of chart we want to create
        type: 'bar',

        // The data for our dataset
        data: {
            labels: labels,
            datasets: [{
                label: title,
                backgroundColor: 'rgb(255, 99, 132)',
                borderColor: 'rgb(255, 99, 132)',
                data: data
            }]
        },
        options: options
    });
}

registerViewer('ledger-account-report', {
    load: function() {
        const v = this;
        const vc = cloneTemplate('tpl-ledger-account-report');
        v.space.mux.request('space', [
            'get-account-info',
            v.data.account_id
        ], function(u) {
            vc.find('#name').textContent = u[0].name;
            vc.find('#path').textContent = u[3].map(function(x) {
                return x.name + "/";
            }).join('');
            u[2].forEach(function(x){
                var opt = document.createElement('option');
                opt.value = x.unit_code;
                opt.innerHTML = x.unit_code;
                vc.find('#unit').appendChild(opt);
            });
        });

        var statChart = null;
        function loadRecentStat() {
            var range = vc.find('#range').value;
            var selUnit = vc.find('#unit');
            var unit = selUnit.value || false;
            var unitText = selUnit.options[selUnit.selectedIndex].text;
            var req = ['list-account-stat'];
            req.push(v.data.account_id);
            req.push(unit);
            var labels = [];
            for (var i = 14; i >= -1; i--) {
                var t;
                if (range == '15d') {
                    t = moment().subtract(i, 'days');
                    labels.push(t.format('MM-DD'));        
                } else if (range == '15m') {
                    t = moment().subtract(i, 'months').startOf('month');
                    labels.push(t.format('YYYY-MM'));
                } else if (range == '15y') {
                    t = moment().subtract(i, 'years').startOf('year');
                    labels.push(t.format('YYYY'));
                }
                req.push(t.format('YYYY-MM-DD'));
            }
            v.space.mux.request('space', req, function(x) {
                console.log(x);
                if (statChart)
                    statChart.destroy();
                var ctx = vc.find('#chart').getContext('2d');
                if (unit) {
                    statChart = createChartStat(
                        ctx, unit, unitText, labels,
                        x.map(function(y){ return getDisplayableQuantity(y.qty||0) })
                    );
                } else {
                    statChart = createChartStat(
                        ctx, unit, unitText, labels,
                        x.map(function(y){ return getDisplayableQuantity(y.val||0) })
                    );
                }
            });
        }

        loadRecentStat();
        vc.find('#range').onchange = loadRecentStat;
        vc.find('#unit').onchange = loadRecentStat;
        
        return vc;
    }
});
