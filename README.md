Twinkle Notes
=============

Twinkle Notes is a privacy-first personal knowledge base with end-to-end encrypted syncing.
Notes are stored in encrypted sqlite3 files (SQLCipher).
For further information, see https://twinkle.app

We decide to open source the app because we believe

- You should trust code only when data privacy matters;
- Security bugs are easier to find when code is published.

## START APP SERVER

Twinkle Notes can be developed with any text editor, and then test and debug it inside browser as a web app.
To run twinkle notes as a standalone app server, first make sure you have both `twinkle-lisp` and `twinkle-notes` checked out under the same directory.
Then

```
cd twinkle-notes
ln -s ../twinkle-lisp/lisp .
../twinkle-lisp/twk launch control --port ,6782
```
Now you can use twinkle notes as a webapp from browser `http://127.0.0.1:6782`. 

The "backend" is implemented inside directory `site-lisp`, and "frontend" in `web`.
They are the core of the app, and where the majority of our time is spent.

## PLATFORM APPS

Twinkle Notes app server can be embedded within an application, which only includes a webview to display app UI.
On Android/iOS/Mac, we use system provided webview to minimize memory footprint;
On windows/linux, we have no choice but to use chromium embedded framework.

See `src/**` for platform specific implementations.

## LICENSE

Unless specified individually or originated from other projects,
files from this project are released under AGPL license (See LICENSE).
