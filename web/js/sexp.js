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

function print(s)
{
    console.log(s);
}

function SEXP_Parser(s, pos)
{
    var self = this;

    function peek() { 
        if (s.length == pos)
            return '';
        else
            return s.charAt(pos);
//            return s.substring(pos,pos+1);
    }

    function isspace(c) {
        return (c == ' ' || c == '\t' || c == '\n' || c == '\r');
    }

    function getchar() {
        var b = pos;
        var c = _getchar();
//        print(b+":"+c);
        return c;
    }
    
    function _getchar() {
        if (s.length == pos) {
            return '';
        }
//        var c = s.substring(pos, pos+1);
        var c = s.charAt(pos);
        pos++;
        return c;
    }

    function checkDict(l) {
        if (l.length > 0) {
            var i = 0;
            var dict = {};
            for (; i < l.length; i++) {
                if (!Array.isArray(l[i]) || l[i].length != 3 || l[i][1] != '.')
                    break;
                dict[l[i][0]] = l[i][2];
            }
            if (i == l.length) {
                return dict;
            }
        }
        return l;
    }

    function list() {
        var l = [];
        while (true) {
            var c = get_not_space();
            if (c == ')') {
                return checkDict(l);
            } else if (c == '') {
                throw new Error('bad list');
            } else {
                l.push(sexp(c));
            }
        }
        return l;
    }

    function string() {
        var str = '';
        while (true) {
            var c = getchar();
            if (c == '"') {
                return str;
            } else if (c == "\\") {
                c = getchar();
                if (c == 't') {
                    str += "\t";
                } else if (c == 'n') {
                    str += "\n";
                } else if (c == 'r') {
                    str += "\r";
                } else if (c == "\"") {
                    str += "\"";
                } else if (c == "\\") {
                    str += "\\";
                } else {
                    throw new Error('bad string');
                }
            } else if (c == '') {
                throw new Error('bad string');
            } else {
                str += c;
            }
        }
    }

    function atom(c) {
        var str = c;
        while (true) {
            c = peek();
            if (isspace(c) || c == '(' || c == ')' || c == '') {
                break;
            } else {
                str += getchar();
            }
        }

        if (str === 'undefined') {
            return undefined;
        } else if (str === 'true') {
            return true;
        } else if (str === 'false') {
            return false;
        }

        var n = Number.parseFloat(str);        
        if (Number.isNaN(n)) {
            return str;
        } else  {
            return n;
        }
    }

    function sexp(c) {
        var r = null;
        if (c == '') {

        } else if (c == '(') {
            r = list();
        } else if (c == '\"') {
            r = string();
        } else {
            r = atom(c);
        }
        return r;
    }

    function get_not_space() {
        var c = getchar();
        while (isspace(c)) {
            c = getchar();
        }
        return c;
    }

    this.next = function () {
        var c = get_not_space();
        self.begin = pos-1;
        var r = sexp(c);
        self.end = pos;
        return r;
    };
}


var SEXP = SEXP || {
    parse: function(s, offset) {
        if (!offset)
            offset = 0;
        var parser = new SEXP_Parser(s, offset);
        var r = parser.next();
        return {
            data: r,
            begin: parser.begin,
            end: parser.end
        };
    },
    parseMessage: function(s) {
        var r = SEXP.parse(s, 0);
        if (r && r.end == s.length) {
            return {
                method: r.data[0],
                args: r.data.splice(1)
            };
        }
        return null;
    },
    stringify: function(t) {
        
    }
};


function SEXP_Test()
{
    print(SEXP.parse("(a (1 2 \"\\r3\\t3\\n\") 1 2 3)"));
    print(SEXP.parseMessage("(a (1 2 3) 1 2 3)"));
}

//SEXP_Test();
