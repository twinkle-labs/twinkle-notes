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

function parseNote(text) {
    const PLAIN = 0;
    const MATH = 1;
    const REF = 2;
    const NAME = 3;
    const TAG = 4;
    const MATH_BLOCK = 5;
    const CODE = 6;
    const CODE_BLOCK = 7;
    const QUOTE = 8;
    const END = 9;
    const BOLD = 10;
    const LIST_ITEM = 11;
    const MENTION = 12;
    const ITALIC = 13;
    const UNDERLINE = 14;
    const HEADING = 15;
    const HREF=16;
    const VERBATIM=17;
    const QUOTE_BLOCK=18;

    const types = [
        'plain',
        'math',
        'ref',
        'name',
        'tag',
        'math-block',
        'code',
        'code-block',
        'quote',
        'end',
        'bold',
        'list-item',
	'mention',
	'italic',
	'underline',
        'heading',
        'href',
        'verbatim',
        'quote-block',
    ];

    var tokens = [];
    var next_pos = 0;
    var tok_type = PLAIN;
    var tok_begin = 0;

    if (!text)
        return [];

    function isspace(c) {
        return (c == ' ' || c == '\t' || c == '\n' || c == '\r');
    }
    
    function getchar() {
        if (next_pos < text.length)
            return text[next_pos++];
        else
            return '';
    }

    function peekchar(offset) {
        var pos = next_pos + (offset?offset:0);
        if (pos >= 0 && pos < text.length)
            return text[pos];
        else
            return '';
    }

    function nextToken(next_type, offset) {
        var pos = next_pos + offset;
        if (pos > tok_begin)
        {
            tokens.push({
                type: types[tok_type],
                begin: tok_begin,
                end: pos,
                text: text.substring(tok_begin, pos)
            });
        }
        tok_begin = pos;
        tok_type = next_type;
    }

    while (tok_type != END) {
        var c = getchar();
        if (c == '') {
            nextToken(END, 0);
            break;
        }
        switch (tok_type) {
        case PLAIN:
            switch (c) {
            case '"':
                nextToken(QUOTE,-1);
                break;
            case '>':
                c = peekchar(-2);
                if (c == '' || c == '\n') {
                    nextToken(QUOTE_BLOCK,-1);
                }
                break;
            case '$':
                nextToken(MATH,-1);
                break;
            case '#':
		c = peekchar();
		if (c == ' ') {
		    c = peekchar(-2);
		    if (c == '' || c == '\n')
			nextToken(LIST_ITEM,-1);
		} else {
		    c = peekchar(-2);
		    if (c == '' || c == '\n' || c == ' ')
                        nextToken(TAG,-1);
		}
                break;
	    case '@':
		c = peekchar(-2);
		if (c == '' || c == '\n' || c == ' ')
		    nextToken(MENTION, -1);
		break;
            case '[':
                nextToken(REF,-1);
                break;
            case '~':
                nextToken(VERBATIM, -1);
                break;
            case '`':
                nextToken(CODE, -1);
                break;
	    case '=':
                // We must have whitespace before =,
                // and no whitespace after =.
                // This is stricter than ` because it's very common
                // in everyday texts.
                c = peekchar(-2);
                if (c == ' ' || c == '\n' || c == '') {
                    c = peekchar();
                    if (c != '' && c != '\n' && c != ' ')
                        nextToken(CODE, -1);
                }
                break;
            case '*':
                c = peekchar(-2);
                if (c == ' ') {
                    nextToken(BOLD, -1);
                } else if (c == '' || c == '\n') {
                    for (var i = 0; ; i++) {
                        c = peekchar(i);
                        if (c != '*')
                            break;
                    }
                    if (c == ' ') {
                        nextToken(HEADING, -1);
                    } else {
                        nextToken(BOLD, -1);
                    }
                }
                break;
            case '_':
                c = peekchar(-2);
		if (c == '' || c == '\n' || c == ' ') {
		    c = peekchar();
                    if (c != '' && c != '\n' && c != ' ')
			nextToken(UNDERLINE, -1);
		}
                break;
            case '/':
                c = peekchar(-2);
		if (c == '' || c == '\n' || c == ' ') {
		    c = peekchar();
                    if (c != '' && c != '\n' && c != ' ')
			nextToken(ITALIC, -1);
		}
                break;
            case '-':
                c = peekchar(-2);
                if (c == '' || c == '\n') {
                    nextToken(LIST_ITEM,-1);
                }
                break;
            case ':':
                if (peekchar()=='/' && peekchar(1)=='/') {
                    var i = next_pos;
                    while (i > 0) {
                        if (isspace(text[i])) {
                            i++;
                            break;
                        }
                        i--;
                    }
                    nextToken(HREF,i-next_pos);
                }
                break;
            default:
                break;
            }
            break;
        case HREF:
            if (c == '\n' || c == ' ')
                nextToken(PLAIN,-1);
            break;
        case QUOTE_BLOCK:
            if (c == '\n')
                nextToken(PLAIN, 0);
            break;
        case QUOTE:
            if (c == '"')
                nextToken(PLAIN, 0);
            break;
        case LIST_ITEM:
            if (c == '\n') {
		c = peekchar();
		if (c != ' ') {
                    nextToken(PLAIN, 0);
		}
	    }
            break;
        case BOLD:
            if (c == '*')
                nextToken(PLAIN, 0);
            else if (c== '\n')
                nextToken(PLAIN,-1);
            break;
        case HEADING:
            if (c== '\n')
                nextToken(PLAIN,0);
            break;
        case ITALIC:
            if (c == '/')
                nextToken(PLAIN, 0);
            else if (c== '\n')
                nextToken(PLAIN,-1);
            break;
        case UNDERLINE:
            if (c == '_')
                nextToken(PLAIN, 0);
            else if (c== '\n')
                nextToken(PLAIN,-1);
            break;
        case VERBATIM:
            if (c == '~' || c == '\n')
                nextToken(PLAIN, 0);
            break;
        case CODE:
	    var x = text[tok_begin];
            switch (c) {
            case x:
                if (next_pos - tok_begin == 2) {
                    while (c == x) {
                        c = getchar();
                    }
                    tok_type = CODE_BLOCK;
                } else {
                    nextToken(PLAIN, 0);
                }
                break;
            case '\n':
                nextToken(PLAIN,-1);
                break;
            default:
                break;
            };
            break;
        case CODE_BLOCK:
	    var x = text[tok_begin];
            switch (c) {
            case x:
                if (peekchar(-2) != '\n')
                    break;
                c = getchar();
                if (c == x) {
                    while (c == x)
                        c = getchar();
                    nextToken(PLAIN, (c!=''&&c!='\n')?-1:0);
                }
                break;
            case '\\':
                getchar();
                break;
            default:
                break;
            }
            break;
        case MATH:
            switch (c) {
            case '$':
                if (next_pos - tok_begin == 2) {
                    tok_type = MATH_BLOCK;
                } else {
                    nextToken(PLAIN, 0);
                }
                break;
            case '\\':
                getchar();
                break;
            case '\n':
                tok_type = PLAIN;
                next_pos = tok_begin+1;
                break;
            default:
                break;
            }
            break;
        case MATH_BLOCK:
            switch (c) {
            case '$':
                c = getchar(c);
                if (c == '$') {
                    nextToken(PLAIN, 0);
                    c = peekchar();
                    if (c == '\n') {
                        tok_begin++;
                    }
                }
                break;
            case '\\':
                getchar();
                break;
            default:
                break;
            }
            break;
        case TAG:
	case MENTION:
            if (isspace(c)) {
                nextToken(PLAIN, -1);
            }
            break;
        case REF:
            if (c == ']') {
                nextToken(PLAIN, 0);
            }
            break;
        default:
            throw new Error('Invalid token type');
            break;
        }
    }
    
    return tokens;
}

function trimCode(text)
{
    var i,j;

    if (text.length < 3)
	return text;

    var x = text[0];
    
    for (i = 0; i < text.length; i++)
        if (text[i] != x && text[i] != '\n')
            break;
    
    for (j = text.length; j>0 ;j--)
        if (text[j-1] != x && text[j-1] != '\n')
            break;

    return text.substring(i,j);
}

function trimChar(text, ch)
{
    if (text[text.length-1]==ch) {
        return text.substring(1,text.length-1);
    } else {
        return text.substring(1);
    }
}

function toggleHiddenField(event) {
    var el = event.target.closest('.note-hidden-field');
    el.find('.note-secret').classList.toggle('collapse');
    if (el.find('.fa').classList.contains('fa-eye-slash')) {
        el.find('.fa').classList.remove('fa-eye-slash');
        el.find('.fa').classList.add('fa-eye');
    } else {
        el.find('.fa').classList.add('fa-eye-slash');
        el.find('.fa').classList.remove('fa-eye');
    }
}

function didClickImageInNote(event)
{
    var el = event.target;
    var viewer = el.findViewer();
    if (viewer) {
        event.stopPropagation();
        viewer.space.openViewer({
            type: 'image',
            url: el.getAttribute('src')
        }, viewer);
    }
}

function renderNote(tokens, c, noteInstance)
{
    var container;
    if (c)
    {
        while (c.lastChild)
            c.removeChild(c.lastChild);
        container = c;
    }
    else
    {
        container = document.createElement('div');
        container.className = 'note-content';
    }

    for (var k = 0; k < tokens.length; k++) {
        var tok = tokens[k];
        switch (tok.type) {
        case 'plain':
            container.appendChild(document.createTextNode(tok.text));
            break;
        case 'math':
            var b = document.createElement('span');
            katex.render(tok.text.substring(1,tok.text.length-1), b, {
                throwOnError: false
            });
            container.appendChild(b);
            break;
        case 'math-block':
            var b = document.createElement('div');
            b.className = 'note-math-block';
            katex.render(tok.text.substring(2,tok.text.length-2), b, {
                displayMode: true,
                throwOnError: false
            });
            container.appendChild(b);
            break;
        case 'heading':
            var nstar = tok.text.indexOf(' ');
            var h = document.createElement('h'+(nstar>3?3:nstar));
            var toks = parseNote(tok.text.trim().substring(nstar+1));
            renderNote(toks, h, noteInstance);
            container.appendChild(h);            
            break;
            
        case 'bold':
            var el = document.createElement('b');
            el.textContent = trimChar(tok.text, '*');
            container.appendChild(el);
            break;
        case 'italic':
            var el = document.createElement('i');
            el.textContent = trimChar(tok.text, '/');
            container.appendChild(el);
            break;
        case 'underline':
            var el = document.createElement('span');
            el.className = "text-underline";
            el.textContent = trimChar(tok.text, '_');
            container.appendChild(el);
            break;
        case 'verbatim':
            container.appendChild(document.createTextNode(trimChar(tok.text, '~')));
            break;
        case 'code':
            var el = document.createElement('code');
            el.textContent = trimCode(tok.text);
            container.appendChild(el);
            break;
        case 'code-block':
            var el = document.createElement('pre');
            el.className='code-block';
            el.textContent = trimCode(tok.text);
            container.appendChild(el);
            break;
        case 'quote-block':
            var el = document.createElement('blockquote');
            el.textContent = tok.text.substring(1);
            container.appendChild(el);
            break;
        case 'quote':
            var el = document.createElement('q');
            el.textContent = tok.text.substring(1,tok.text.length-1);
            container.appendChild(el);
            break;
        case 'href':
            var el = document.createElement('a');
            el.textContent = tok.text;
            el.href = tok.text;
            el.target = '_blank';
            container.appendChild(el);
            break;
        case 'list-item':
            var el = document.createElement(tok.text[0]=='-'?'ul':'ol');
            for (; k < tokens.length && tokens[k].type == 'list-item'; k++) {
                tok = tokens[k];
                var child = document.createElement('li');
                var m = 1, n = tok.text.length;
                for (; m < n; m++)
                    if (tok.text[m] != ' ')
                        break;
                for (; m < n; n--)
                    if (tok.text[n-1] != ' ')
                        break;
                var t = tok.text.substring(m,n);
                var toks = parseNote(t);
                for (var x = 0; x < toks.length; x++) {
                    toks[x].begin += tok.begin+m;
                    toks[x].end += tok.begin+m;
                }
                renderNote(toks, child, noteInstance);
                el.appendChild(child);
            }
            container.appendChild(el);
            k--;
            break;
        case 'ref':
        {
            var el = null;
            var refString = tok.text.substring(1,tok.text.length-1);
            var refParts = refString.split(':');
            var type = refParts[0].split('/')[0];
            switch (type) {
            case 'image':
                el = document.createElement('img');
                el.setAttribute('src', refParts[1]);
                el.onclick = didClickImageInNote;
                break;
            case 'avatar':
                el = document.createElement('img');
                el.className = 'avatar-large';
                el.setAttribute('src', tok.text.substring(8, tok.text.length-1));
                el.style.float = 'right';
                break;
            case 'video':
            case 'audio':
                var src = document.createElement('source');
                src.setAttribute('src', refParts[1]);
                if (refParts[0].indexOf('/') >-1)
                    src.setAttribute('type', refParts[0]);
                el = document.createElement('video');
                el.setAttribute('controls', true);
                el.appendChild(src);
                break;
            case 'open':
		// [open:<viewer-type>:param1=value1,param2=value2,...]
                if (noteInstance && refParts.length > 1) {
                    var vtype = refParts[1];
                    if (ViewerTypes[vtype]) {
			var vconf = ViewerTypes[vtype];
                        var params = { type: vtype};
                        if (refParts.length > 2) {
                            refParts[2].split(',').forEach(function(x) {
                                x = x.trim().split('=');
                                if (x.length == 2) {
                                    params[x[0]] = x[1];
                                } else if (x.length == 1) {
                                    params[x[0]] = true;
                                }
                            });
                        }
                        el = document.createElement('button');
                        el.className = 'btn btn-inline';
                        el.textContent = vconf.name?vconf.name:vtype;
                        el.onclick = (function(params) {
                            return function(e) {
                                e.preventDefault();
                                e.stopPropagation();
                                noteInstance.viewer.space.openViewer(params, noteInstance.viewer);
                            };
                        })(params);
                    }
                }
                break;
	    case 'i':
		if (refParts.length > 1) {
                    el = document.createElement('i');
		    el.className = "fa fa-" + refParts[1];
		} else {
                    el = document.createElement('span');
		    el.textContent = tok.text;
		}
		break;
            case ' ': case 'x': case 'X':
                el = document.createElement('input');
                el.type = "checkbox";
                el.checked = !(tok.text=="[ ]");
                el.tokenPosition = tok.begin;
                break;
            case '=':
                break;
            case 'hidden':
                el = document.createElement('span');
                el.className = 'note-hidden-field';
                el.innerHTML = '<button class="btn btn-inline"><i class="fa fa-eye"></i></button>';
                el.firstChild.onclick = toggleHiddenField;
                var elHiddenText = document.createElement('span');
                elHiddenText.textContent = refParts[1];
                elHiddenText.className = 'collapse note-secret';
                el.prepend(elHiddenText);
                break;
            case 'http': case 'https':
                el = document.createElement('a');
                if (refParts.length > 2) {
                    el.textContent = refParts[2];
                    el.href = refParts[0] + ":" + refParts[1];
                } else {
                    el.textContent = refString.replace(type+"://", '');
                    el.href = refString;
                }
                el.target = '_blank';
                break;
            case 'file':
                if (refParts.length>1) {
                    var attrs = {};
                    if (refParts.length > 2) {
                        refParts[2].split(",").forEach(function(x){
                            x = x.trim().split('=');
                            if (x.length > 1)
                                attrs[x[0]] = x[1];
                        });
                    }
                    if (/^image\//i.test(attrs.type)) {
                        el = document.createElement('img');
                        el.setAttribute('src',refParts[1]);
                    } else {
                        el = document.createElement('span');
                        el.className = 'file-ref';
                        var a = document.createElement('a');
                        var ref = refParts[1];
                        if (attrs.name) {
                            ref += "?name=" + attrs.name;
                        }
                        a.href = ref;
                        a.target = '_blank';
                        if (attrs.name) {
                            a.textContent = attrs.name;
                        } else {
                            a.textContent = 'file:'+refParts[1].substring(6, 22);
                        }
                        el.appendChild(a);
                        var s = '';
                        if (attrs.size)
                            s += attrs.size + " Bytes";
                        el.appendChild(createTextSpan('('+s+')'));
                    }
                }
                break;
            default:
                if (ViewerTypes[type] && ViewerTypes[type].embed) {
                    var vt = ViewerTypes[type];
                    var args = [noteInstance];
                    if (refParts.length > 1) {
                        refParts[1].split(',').forEach(function(x){
                            args.push(x.trim());
                        });
                    }
                    if (noteInstance)
                        el = vt.embed.apply(noteInstance.viewer, args);
                    break;
                }

                if (type.match(/^[0-9A-Fa-f]{4,}$/)) {
                    el = document.createElement('a');
                    el.className = 'note-ref';
                    if (refParts.length > 1) {
                        el.textContent = refParts[1];
                    } else {
                        if (type.length > 8) {
                            el.textContent = type.substring(0,8);
                        } else {
                            el.textContent = type;
                        }
                    }
                    el.noteRef = type.toLowerCase();
                    break;
                }

                break;
            }
            if (!el)
            {
                el = document.createElement('span');
                el.textContent = tok.text;
            }
            container.appendChild(el);
            break;
        }
	case 'mention':
	    var el = createMention(noteInstance.viewer, tok.text);
            container.appendChild(el);
	    break;
        case 'tag':
	    var el = createNoteTag(noteInstance.viewer, tok.text);
            container.appendChild(el);
            break;
        default:
            break;
        }
    };
    
    return container;
}

// Return the plain text content of a content-editable div
function extractNoteContent(el)
{
    return el.innerText; // Kudos to IE 
}
