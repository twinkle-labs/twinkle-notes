* Twinkle Notes

Twinkle Notes is a privacy-first personal knowledge base with end-to-end encrypted syncing.
We decide to open source the app because we believe

- Users must only trust code when it comes to data privacy;
- Security bugs are easier to find when code is published.

START APP SERVER
================

Twinkle Notes can be developed with any text editor, and then test and debug it inside browser as a web app.
To run twinkle notes as a standalone app server, first make sure you have both `twinkle-lisp` and `twinkle-notes` checked out under the same directory. Then

```
cd twinkle-notes
ln -s ../twinkle-lisp/lisp .
../twinkle-lisp/twk launch control --port ,6782
```
Now you can use twinkle notes as a webapp from browser `http://127.0.0.1:6782`.

LICENSE
=======

Unless specified individually or originated from other projects,
files from this project are released under AGPL license (See LICENSE).
