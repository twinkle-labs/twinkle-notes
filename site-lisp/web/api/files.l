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

(defmethod (upload req &key token)
  (define size (string->number (http-request-get-header req 'Content-Length)))
  (define type (http-request-get-header req 'Content-Type))
  (if (not type) (set! type "application/octet-stream"))

  (define session (http-get-session req))
  (if (not session)
      (error "Invalid access token"))

  (define db-key session:dbkey)
  (define space-path (space-storage-get-path session:dbname))
  (if (not (file-exists? space-path))
      (error "space not found"))
  (define db (open-sqlite3-database space-path))

  (if (> (length db-key) 0)
      (db 'exec "PRAGMA key=\"x'\{(hex-encode db-key)}'\""))

  (define (add-plain-blob-from input type size)
    (db 'query "INSERT INTO pblob (type, size, ctime, content) 
VALUES (?,?,?,ZEROBLOB(?))"
	type size (time) size)
    (define id (db 'last-insert-id))
    (define b-o (db 'open-blob-output "pblob" "content" id))
    (define sha256-o (open-sha256-output b-o))
    (define n (pump input sha256-o size))
    (if (not (eq? n size))
	(error "add plain blob from input"))

    (define hash (hex-encode (sha256-output-finalize sha256-o)))
    (close sha256-o)
    (close b-o)

    (define x (db 'first "SELECT type,size FROM pblob WHERE hash=?" hash))
    (if (null? x)
	(db 'query "UPDATE pblob SET hash=? WHERE id=?" hash id)
	(db 'query "DELETE FROM pblob WHERE id=?" id))
    hash)
  
  (define hash (add-plain-blob-from http-input type size))
  (db 'finalize)
  (http-send-json (alist->json (list :path "/blob/\{hash}")))
  )
