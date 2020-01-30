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

;; space-list.l -- Secure storage for space list information
;;
;; Space list (abbr. spl) is a plain alist with following fields:
;; - version
;; - name
;; - created: unix timestamp
;; - salt : cipher related
;; - iter : cipher related
;; - data: encrypted on disk. Containing list of space entries, etc.
;;   will be decrypted when loaded into memory.
;;
;; Actual space data, public/private keys, secrets are all stored
;; in the database file.
;;
(define space-list-path "\{*var-path*}/data/spaces.config.l")
(define space-list-tmp "\{*var-path*}/data/spaces.config.tmp")

(define (space-list-exists?)
  (file-exists? space-list-path))

(define (space-list-create passphrase)
  (if (file-exists? space-list-path)
      (error "Already exists"))
  (if (or (not (string? passphrase))
	  (< (string-length passphrase) 6))
      (error "Bad passphrase"))
  (define spl (list
		    :name "Twinkle-Space-List"
		    :version 1
		    :created (time)
		    :iter 10000
		    :salt (random-bytes 16)
		    :data '((spaces) (default))))
  (space-list-save spl :passphrase passphrase))

(define (space-list-save spl &key passphrase key)
  (cond [(eq? spl:version 1)
	 (if key
	     (set! key (hex-decode key))
	     (set! key (pbkdf2-hmac-sha1 passphrase spl:salt spl:iter)))
	 (define iv (sha256 (concat spl:name spl:version spl:created)))
	 (if (and (assoc 'data spl) (not (null? spl:data)))
	     (let [(x (encrypt (concat spl:data) "aes-256-cbc" key iv))]
	       (set! spl (alist-set spl 'data x))))
	 (write-to-file spl space-list-tmp)
	 (if (not (rename space-list-tmp space-list-path))
	    (error "Can not save space list"))
	 ]
	[else (error "Bad space list version")]))

(define (space-list-load &key passphrase key)
  (if (not (space-list-exists?))
      (error "Space list not exists:" space-list-path))
  (define spl (read-from-file space-list-path))
  (if (or (not (assoc 'data spl))
	  (null? spl:data))
      (return spl))
  (if (not key)
      (set! key (pbkdf2-hmac-sha1 passphrase spl:salt spl:iter))
      (set! key (hex-decode key)))
  (define iv (sha256 (concat spl:name spl:version spl:created)))
  (define d (read (open-input-buffer (decrypt spl:data "aes-256-cbc" key iv))))
  (alist-set spl 'data d))

;; The application should use key instead of passphrase
;; Used for remember password feature
(define (space-list-derive-key passphrase)
  (if (not (space-list-exists?))
      (return false))
  (define spl (read-from-file space-list-path))
  (pbkdf2-hmac-sha1 passphrase spl:salt spl:iter)
  )

;; Used for remember password feature
;; It's not the actual passphrase that is remembered
;; It's the derived key that is remembered.
;; Since the derived key could be compromised, (we don't know if
;; it will be actually cleared),
;; we should update salt and re-encrypt the space list.
(define (space-list-update-salt passphrase)
  (define spl (space-list-load :passphrase passphrase))
  (if (not spl) (return false))
  ;; We can also update iter count here if we want.
  (set! spl (alist-set spl 'salt (random-bytes 16)))
  (space-list-save spl :passphrase passphrase)
  true
  )

;; We should resalt as well.
(define (space-list-update-passphrase oldpass newpass)
  (define spl (space-list-load :passphrase oldpass))
  (if (not spl) (return false))
  (set! spl (alist-set spl 'salt (random-bytes 16)))
  (space-list-save spl :passphrase newpass)
  true)

(define (space-list-remove-space dbname &key passphrase key)
  (define spl (space-list-load :passphrase passphrase :key key))
  (if (not spl) (return false))
  (define spaces (remove (lambda (x) (eq? (car x) dbname)) spl:data:spaces))
  (if (eq? spl:data:default dbname)
      (if (null? spaces)
	  (set! spl (space-list-set-data-field spl 'default ()))
	  (set! spl (space-list-set-data-field spl 'default (car (car spaces))))))
  
  (set! spl (space-list-set-data-field spl 'spaces spaces))
  (space-list-save spl :passphrase passphrase :key key)
  (println "Removing space " dbname)
  (space-storage-remove dbname)
  true)

(define (space-list-set-data-field spl field value)
  (define data (alist-set spl:data field value))
  (alist-set spl 'data data))

(define (space-list-add-space name &key passphrase key)
  (if (not (space-list-exists?))
      (space-list-create passphrase))
  (define spl (space-list-load :passphrase passphrase :key key));
  (define kp (keygen-secp256k1))
  (define space-id (pubkey->address (cdr kp)))

  (define inst (space-list-find-instance spl space-id space-id))
  (if inst (return (car inst)))
  
  (define shared-secret  (hex-encode (random-bytes 16)))
  (define dbkey (random-bytes 32))
  (define dbname
  (space-storage-create
   space-id
   (cdr kp)
   (list
    :name name
    :pk (cdr kp)
    :vk (car kp))
   dbkey
   :shared-secret shared-secret))

  (if (null? spl:data:default)
      (set! spl (space-list-set-data-field spl 'default dbname)))

  (define spaces (alist-set spl:data:spaces dbname
			    (list
			     :name name
			     :uuid space-id
			     :creator space-id
			     :dbname dbname
			     :dbkey dbkey
			     :created (time))))
  (set! spl (space-list-set-data-field spl 'spaces spaces))
  (space-list-save spl :passphrase passphrase :key key)
  dbname)
  
(define (space-list-import-space name uuid vk shared-secret &key passphrase key)
  (if (not (space-list-exists?))
      (space-list-create passphrase))
  (define spl (space-list-load :passphrase passphrase :key key));
  (define kp (keygen-secp256k1 (hex-decode vk)))
  (define space-id (pubkey->address (cdr kp)))
  (if (not (eq? space-id uuid))
      (return false))

  (define inst (space-list-find-instance spl space-id space-id))
  (if inst (return (car inst)))

  (define dbkey (random-bytes 32))
  (define dbname (space-storage-create
		  space-id
		  (cdr kp)
		  (list
		   :name name
		   :pk (cdr kp)
		   :vk (car kp))
		  dbkey
		  :shared-secret shared-secret))

  (if (null? spl:data:default)
      (set! spl (space-list-set-data-field spl 'default dbname)))
  (define spaces (alist-set spl:data:spaces dbname
			    (list
			     :name name
			     :uuid space-id
			     :creator space-id
			     :dbname dbname
			     :dbkey dbkey
			     :created (time))))
  (set! spl (space-list-set-data-field spl 'spaces spaces))
  (space-list-save spl :passphrase passphrase :key key)
  dbname)

(define (space-list-find-instance spl space-id user-id)
  (let loop [(u spl:data:spaces)]
    (if (null? u)
	false
	(if (and (eq? space-id (alist-get (car u) 'uuid))
		 (eq? user-id (alist-get (car u) 'creator)))
	    (car u)
	    (loop (cdr u))))))

(define (space-list-join-space name space-id space-pk shared-secret user-name user-vk &key passphrase key)
  (if (not (space-list-exists?))
      (error "Missing space list"))
  (define spl (space-list-load :passphrase passphrase :key key));
  (define kp (keygen-secp256k1 (hex-decode user-vk)))
  (define user-id (pubkey->address (cdr kp)))

  ;; If such an instance already exists, we should return
  ;; the existing one instead of creating new instance
  (define inst (space-list-find-instance spl space-id user-id))
  (if inst (return (car inst)))

  (define dbkey (random-bytes 32))
  (define dbname (space-storage-create
		  space-id
		  (hex-decode space-pk)
		  (list
		   :name user-name
		   :pk (cdr kp)
		   :vk (car kp))
		  dbkey
		  :space-name name
		  :shared-secret shared-secret))

  (if (null? spl:data:default)
      (set! spl (space-list-set-data-field spl 'default dbname)))
  (define spaces (alist-set spl:data:spaces dbname
			    (list
			     :name name
			     :uuid space-id
			     :creator user-id
			     :dbname dbname
			     :dbkey dbkey
			     :created (time))))
  (set! spl (space-list-set-data-field spl 'spaces spaces))
  (space-list-save spl :passphrase passphrase :key key)
  dbname)


