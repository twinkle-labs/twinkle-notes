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

(defmethod (check req)
  (http-send-alist
   (list :present (space-list-exists?))))

(defmethod (get-default req &key passphrase key)
  (define spl (space-list-load :passphrase passphrase :key key))
  (http-send-alist (list :defaultSpace (and spl spl:data:default))))

(defmethod (set-default req &key passphrase key dbname)
  (define spl (space-list-load :passphrase passphrase :key key))
  (set! spl (space-list-set-data-field spl 'default dbname))
  (space-list-save spl :passphrase passphrase :key key)  
  (http-send-alist (list :defaultSpace dbname)))

(defmethod (list-spaces req &key key)
  (define spl (space-list-load :key key))
  (if (not spl)
      (return (http-send-alist (list :error "Can not load space list"))))
  (http-send-alist
   (list spl:data:default  (map ^{[x]
				  ;; Backward compatibility fix
				  ;; Previous space list doesn't have uuid field
				  ;; The key is the uuid
				  (if (assoc 'uuid (cdr x))
				      (cdr x)
				      (cons (cons 'uuid (car x)) (cdr x)))
				  } spl:data:spaces))))

(defmethod (join-space req &key key spaceId spacePk spaceName userName userVk secret)
  (http-send-alist
   (list :space (space-list-join-space spaceName spaceId spacePk secret userName userVk :key key))))


;; The dbname and dbkey of requested space will be associcated
;; with generated access token
;; so that future requests with the accessToken can open
;; the requested space.
(defmethod (requestAccess req &key passphrase key space)
  (define spl (space-list-load :passphrase passphrase :key key))
  (if (not spl)
      (return (http-send-alist (list :accessToken false))))

  (if (not key)
      (set! key (hex-encode (space-list-derive-key passphrase))))

  (if (eq? space "default")
      (if (assoc 'default spl:data)
	  (set! space spl:data:default)
	  (return (http-send-alist (list :accessToken false :key key )))))
  
  (define s (assoc space spl:data:spaces))
  (if (not s)
      (return (http-send-alist (list :accessToken false :key key ))))

  ;; dbname and dbkey should not be visible to the
  ;; clients. They don't need to store.
  (define token (hex-encode (random-bytes 16)))

  (define space-id space)
  (if (assoc 'uuid s)
      (set! space-id s:uuid))
  
  (global-session-db 'insert "token"
		     :id token
		     :space space-id
		     :dbname s:dbname
		     :dbkey s:dbkey
		     :ctime (time))
  
  (http-send-alist
   (list :accessToken token
	 :space space
	 :key key)))

(defmethod (add req &key name passphrase key)
  (define s (space-list-add-space name :passphrase passphrase :key key))
  (http-send-alist (list :space s)))

(defmethod (import req &key ts passphrase salt xstr)
  (define iv (sha256 (concat ts)))
  (set! salt (hex-decode salt))
  (define key (pbkdf2-hmac-sha1 passphrase salt 100000))
  (define d (read (open-input-buffer (decrypt (base64-decode xstr) "aes-256-cbc" key iv))))
  (println "Import:"  d)
  (define s (space-list-import-space d:name d:uuid d:vk d:shared-secret :passphrase passphrase))
  (http-send-alist (list :space s)))

(defmethod (remove-space req &key dbname key)
  (if (space-list-remove-space dbname :key key)
      (http-send-alist (list :message "OK"))
      (http-send-alist (list :error "Failed"))))

(defmethod (export req &key passphrase)
  (define session (http-get-session req))
  (if (not session)
      (error "Invalid access token"))
  
  (define dbname session:dbname)
  (define dbkey session:dbkey)
  (define space-path (space-storage-get-path dbname))
  (if (not (file-exists? space-path))
      (error "space not found"))
  (define db (open-sqlite3-database space-path))

  (if (> (length dbkey) 0)
      (db 'exec "PRAGMA key=\"x'\{(hex-encode dbkey)}'\""))
  
  (define salt (random-bytes 16))
  (define ts (time))
  (define iv (sha256 (concat ts)))
  (define key (pbkdf2-hmac-sha1 passphrase salt 100000))

  (define u (db 'first "SELECT * FROM user WHERE uuid=?" session:space))
  (define secret (db 'first "SELECT * FROM config WHERE name=?"
		     'shared-secret))
  (define d (list :name u:name :uuid u:uuid :vk u:vk
		  :shared-secret secret:value
		  :exported (time)))
  
  (define x (encrypt (concat d) "aes-256-cbc" key iv))
  (http-send-alist
   (list :salt (hex-encode salt)
	 :ts ts
	 :xstr (base64-encode x))))

;; When client wants to keep the app unlocked
;; then the key must be saved in client side
;; not the passphrase.
;; And when it is due to expire, 
;; the client should call update-salt to make sure
;; the saved key can not be used any more.
(defmethod (derive-key req &key passphrase)
  (http-send-alist
   (list :key (hex-encode (space-list-derive-key passphrase)))))

(defmethod (update-passphrase req &key oldpass newpass)
  (http-send-alist
   (list :success (space-list-update-passphrase oldpass newpass))))

(defmethod (update-salt req &key passphrase)
  (if (not (space-list-update-salt passphrase))
      (http-send-alist
       (list :success false))
      (http-send-alist
       (list :success true
	     :key (space-list-derive-key passphrase)))))
