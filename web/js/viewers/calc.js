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
 * calc -- A simple calculator
 *
 * Rely on JS eval() to perform calculation.
 * 
 * Reference:
 *   http://www.javascriptkit.com/script/cut42.shtml
 */
registerViewer('calc', {
    load: function() {
        var v = this;

        // Declare shortcuts to be used within input formula
        var cos = Math.cos;
        var sin = Math.sin;
        var tan = Math.tan;
        var PI = Math.PI;
        var sqrt = Math.sqrt;
        var log = Math.log;
        var exp = Math.exp;
        var pow = Math.pow;
        var random = Math.random;

        var elForm = cloneTemplate('tpl-calc');
        var elTable = document.createElement('table');
        elTable.className = "column-medium vsmallskip";
        elForm.appendChild(elTable);
        elForm.onclick = function(e) { e.preventDefault(); };

        var firstRow = document.createElement('tr');
        var td = document.createElement('td');
        td.setAttribute('colspan', 5);
        var display = document.createElement('input');
        display.className = "form-control";
        display.name = 'display';
        display.value = 0;
        display.style.width='100%';
        td.appendChild(display);
        firstRow.appendChild(td);
        elTable.appendChild(firstRow);
        
        function changeSign() {
	    if(display.value.charAt(0) == "-")
		display.value = display.value.substring(1, display.value.length)
	    else
		display.value = "-" + display.value
            display.scrollLeft = 0;
            display.style.color = '#000';            
        }

        function addChar(character) {
	    if(display.value == null || display.value == "0")
		display.value = character
	    else
		display.value += character
            // This is better than setSelectionRange()
            // because it works when display is not focus 
            display.scrollLeft = display.scrollWidth;
            display.style.color = '#000';
        }

        function calcString(s) {
            try {
                var x = eval(s);
                display.value = '' + x;
                display.style.color = '#000';
            } catch(err) {
                app.err("Bad input");
                display.style.color = 'red';
            }
        }

        function createButtonItem(fn) {
            return {
                title: fn,
                action: function() {
                    calcString("Math."+fn+"("+display.value+")");
                }
            }
        }

        function addRow(items) {
            var tr = document.createElement('tr');
            items.forEach(function(x) {
                var td = document.createElement('td');
                var btn = document.createElement('button');
                btn.className = "btn";
                if (x.primary) {
                    btn.classList.add('btn-primary');
                }
                if (x.icon) {
                    btn.innerHTML='<i class="fa fa-'+x.icon+'"></i>';
                } else {
                    btn.textContent = x.title;
                }
                btn.onclick = x.action;
                if (x.colspan) {
                    btn.style.width = '100%';
                    td.setAttribute('colspan', x.colspan);
                } else {
                    btn.style.width = '3.5rem';
                }
                td.appendChild(btn);
                tr.appendChild(td);
            });
            elTable.appendChild(tr);
        }

        addRow([
            {
                title: 'CLR',
                action: function() {
                    display.style.color = '#000';
                    display.value = 0;
                }
            },
            {
                icon: 'backspace',
                action: function() {
                    if (display.value.length > 1)
	                display.value = display.value.substring(0, display.value.length - 1)
                    else
                        display.value = 0
                    display.style.color = '#000';
                }
            },
            {
                icon: 'copy',
                action: function() {
                    copyToClipboard(display.value);
                }
            },
            {
                icon: 'equals',
                colspan: 2,
                primary: true,
                action: function() {
                    calcString(display.value);
                }
            }]);
        
        addRow([
            createButtonItem("exp"),
            {title: "7", action: function(){addChar('7')}},
            {title: "8", action: function(){addChar('8')}},
            {title: "9", action: function(){addChar('9')}},
            {title: "/", action: function(){addChar('/')}}
        ]);

        addRow([
            createButtonItem("log"),
            {title: "4",  action: function(){addChar('4')}},
            {title: "5",  action: function(){addChar('5')}},
            {title: "6",  action: function(){addChar('6')}},
            {title: "*",  action: function(){addChar('*')}}
        ]);

        addRow([
            createButtonItem("sqrt"),
            {title: "1", action: function(){addChar('1')}},
            {title: "2", action: function(){addChar('2')}},
            {title: "3", action: function(){addChar('3')}},
            {title: "-", action: function(){addChar('-')}}
        ]);

        addRow([
            {
                title: "sq",
                action: function() {
                    calcString("("+display.value+")*("+display.value+")");
                }
            },
            {title: "0", action: function(){addChar('0')}},
            {title: ".", action: function(){addChar('.')}},
            {title: "+/-", action: function(){changeSign()}},
            {title: "+", action: function(){addChar('+')}}
        ]);
        
        addRow([
            {title: "(", action: function() {addChar('(')}},
            createButtonItem("cos"),
            createButtonItem("sin"),
            createButtonItem("tan"),
            {title: ")", action: function() {addChar(')')}},
        ]);

        return elForm;
    }
});
