;;    
;; Copyright (C) 2020, Twinkle Labs, LLC.
;;
;; This program is free software: you can redistribute it and/or modify
;; it under the terms of the GNU Affero General Public License as published
;; by the Free Software Foundation, either version 3 of the License, or
;; (at your option) any later version.
;;
;; This program is distributed in the hope that it will be useful,
;; but WITHOUT ANY WARRANTY; without even the implied warranty of
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
;; GNU Affero General Public License for more details.
;;
;; You should have received a copy of the GNU Affero General Public License
;; along with this program.  If not, see <https://www.gnu.org/licenses/>.
;;

(define (http-try-blob space db-key hash &optional name)
  (define db-path (space-storage-get-path space))
  (if (not (file-exists? db-path))
      (error "space not found"))
  
  (define db (sqlite3-open db-path))

  (if (> (length db-key) 0)
      (sqlite3-exec db "PRAGMA key=\"x'\{(hex-encode db-key)}'\""))

  (define a (sqlite3-first db "
SELECT id,size,type FROM pblob
WHERE hash=?" hash))
    
  (if (null? a)
      (http-not-found hash)
      (let [(size a:size)
	    (rowid a:id)]
	(when (eq? size undefined)
	      (http-not-found hash)
	      (return))
	(define in (sqlite3-open-blob-input db "main" "pblob"  "content" rowid))
	(http-send-from-port in size name a:type)
	(close in)
	))
  (close db))


(cond
 [(prefix? path "/blob/")
  (let []
    (define session (http-get-session req))
    (if (not session)
	(error "Invalid access token"))
    (define space session:dbname)
    (define dbkey session:dbkey)
    (http-try-blob space dbkey (substring path 6) (http-request-param req 'name)))]
 [else
  (http-not-found path)])
