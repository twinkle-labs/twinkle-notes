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

;;======================================================================
;; SPACE Storage
;;
;; To store space related information.
;; The space has an id, and a public key.
;; To play along with the community,
;; you need to abey the rules.
;; It should have an owner's id, bitcoin wallet id.
;;
;; A different kind of digital space.
;; Information is open, knowledge is shared.
;; but access is limited. because you are in somebody else's
;; space. 
;;
;;======================================================================

(define (open-space-storage path db-key)
  (define db (open-sqlite3-database path))

  (if (> (length db-key) 0)
      (db 'exec "PRAGMA key=\"x'\{(hex-encode db-key)}'\""))

  (defmethod (get-config name)
    (define x (db 'find "config" :name name))
    (if (null? x) false x:value))

  (defmethod (set-config name value)
    (db 'insert-or-update "config" :name name :value value))

  (define current-version (get-config 'version))
  (if (string? current-version)
      (set! current-version (string->number current-version)))

  ;; Perform upgrade if necessary
  (dolist (x space-storage-init-list)
	  (if (< current-version (car x))
	      (begin
		(db 'begin-transaction)
		(db 'exec (cdr x))
		(set-config 'version (car x))
		(db 'commit)
		(println "Upgraded db to version " (car x))	
		(set! current-version (car x)))))

  (defmethod (remove-config name)
    (db 'remove "config" :name name))

  (define creator (get-config 'creator)) ;; deprecated.
  (defconst current-user creator) ;; The identity of acting user. Member or Owner.
  (define space-id (get-config 'space-id)) ;; deprecated
  (define current-space space-id) ;; The identity of this space
  (define is-owner (eq? current-user current-space))
  (define creator-keypair false)
  (define space-secret (string->buffer (get-config 'shared-secret)))

  (defmethod (get-creator-keypair)
    (if creator-keypair (return creator-keypair))
    (define x (db 'find "user" :uuid creator :select "pk,vk"))
    (set! creator-keypair (cons (hex-decode x:vk) (hex-decode x:pk)))
    creator-keypair)

  (defmethod (get-space-uuid)
    space-id)
  
  (defmethod (get-space-info)
    (list (find-user space-id)
	  (find-user creator)))

  (defmethod (get-pk uuid)
    (define x (db 'first "SELECT pk FROM user WHERE uuid=?" uuid))
    (if (null? x) false x:pk)
    )

  (define (find-profile uuid)
    (db 'first "SELECT 
p.hash AS hash,
p.ctime AS ctime,
u.mtime AS mtime
FROM profilelog p LEFT JOIN user u ON p.uid = u.id
WHERE u.uuid=? ORDER BY p.ctime DESC LIMIT 1"
	uuid))

  (define (find-user-id uuid)
    (define x (db 'first "SELECT id FROM user WHERE uuid=?" uuid))
    (if (null? x) false x:id))
  
  (defmethod (find-user uuid)
    (db 'first "SELECT id,name,fullname,uuid,email,photo,pk,mtime,ctime,role FROM user WHERE uuid=?" uuid))

  (defmethod (find-user* x)
    (db 'query "SELECT id,name,uuid,email,photo,pk,mtime,ctime,role FROM user WHERE name=? OR uuid LIKE ?" x (concat x "%")))

  (defmethod (list-users)
    (db 'query "SELECT name,uuid,photo,role FROM user"))
  
  (define (empty-hash? x)
    (eq? x ""))

  (define (note-exists? x)
    (not (null? (db 'first "SELECT * FROM notelog WHERE hash=?" x)))
    )

  (define (find-note-id x)
    (define n (db 'first "SELECT id FROM note WHERE hash=?" x))
    (if (null? n)
        false
        (cdr (assoc 'id n))))

  (define (find-rev-id x)
    (define n (db 'first "SELECT id FROM notelog WHERE hash=?" x))
    (if (null? n)
        false
        (cdr (assoc 'id n))))

  (define (check-content-length x)
    (if (> (string-length x) 2000)
        (error "Content exceed limit: max 2000 bytes, got " (string-length x))))

  ;; (add-blob-ref <blobid> <refid>)
  ;; plain blob <blobid> uses/references another blob <refid>
  (define add-blob-ref (db 'prepare "INSERT OR IGNORE INTO blobref (blobid,refid) VALUES (?,?)"))

  (defmethod (has-xblob? xhash)
    (db 'has? "xblob" :xhash xhash))

  (defmethod (has-blob? hash)
    (db 'has? "pblob" :hash hash))
  
  ;; (add-plain-blob <hash> <type> <size> <content>)
  (define (add-plain-blob hash type size content)
    (db 'insert "pblob" :hash hash :type type :size size :xref 1
	:content content :ctime (time)))

  (defmethod (add-plain-blob-from input type size)
    (db 'query "INSERT INTO pblob (type, size, ctime, content) 
VALUES (?,?,?,ZEROBLOB(?))"
	type size (time) size)
    (define id (db 'last-insert-id))
    (define b-o (db 'open-blob-output "pblob" "content" id))
    (define sha256-o (open-sha256-output b-o))
    (define n (pump input sha256-o size))
    (define hash (hex-encode (sha256-output-finalize sha256-o)))
    (define x (db 'first "SELECT type,size FROM pblob WHERE hash=?" hash))
    (if (null? x)
	(db 'query "UPDATE pblob SET hash=? WHERE id=?" hash id)
	(db 'query "DELETE FROM pblob WHERE id=?" id))
    (close sha256-o)
    (close b-o)
    (if (not (eq? n size))
	(error "add plain blob from input"))
    hash)
  
  ;; (add-xblob-1 <xhash> <pbid> <creator> <receiver> <status> <ts> <inst>)
  (define add-xblob-1 (db 'prepare "INSERT INTO xblob (xhash,pbid,creator,receiver,status,ctime,inst) 
VALUES(?,?,?,?,?,?,?)"))
  
  (define (get-shared-secret a b)
    (cond [(or (null? b) (eq? b 'undefined)) space-secret]
          [(eq? b "host") false]
          [(eq? a current-user)
           (ecdh (car (get-creator-keypair))
		 (hex-decode (get-pk b)))]
          [(eq? b current-user)
           (ecdh (car (get-creator-keypair))
		 (hex-decode (get-pk a)))]
          [else (error "No shared secret")]))

  (define (calc-xhash pbid creator receiver type size ts)
    (define blob-input (open-blob-input pbid))
    (define sha256-output (open-sha256-output))
    (define shared-secret (get-shared-secret creator receiver))
    (if shared-secret
       (encrypt-from-input blob-input sha256-output size "aes-256-cfb8" shared-secret (sha256 (concat type size ts)))
       (pump blob-input sha256-output size))
    (define xhash (sha256-output-finalize sha256-output))
    (close sha256-output)
    (close blob-input)
    (hex-encode xhash))

  ;; Make sure pblob <hash> is in xblobs
  ;; Recursively make sure all referenced blobs are also
  ;; pushable to receiver
  (define (add-xblob hash receiver)
    (define pb (find-blob hash))
    (if (null? pb) ;; No such blob
	(return))
    (define pbid pb:id)

    ;; Try to find out if the requested blob is already in xblob
    ;; and pushable to <receiver>
    (define xb ())
    (if (null? receiver)
	(set! xb (db 'first "SELECT id FROM xblob WHERE pbid=? AND receiver IS NULL"
		     pbid))
	(set! xb (db 'first "SELECT id FROM xblob WHERE pbid=? AND receiver=?"
		     pbid receiver)))
    (if (not (null? xb))
	(return))
    
    ;; IMPORTANT: We need to add sub blobs first
    ;; to be able to process xblob stream correctly elsewhere
    (define children (db 'query "SELECT b.hash AS hash
FROM blobref r LEFT JOIN pblob b ON r.refid = b.id
WHERE r.blobid = ? AND b.id IS NOT NULL"
			 pbid))
    (dolist (x children)
	    (add-xblob x:hash receiver))
    
    (define now (time))
    (define xhash (calc-xhash pbid current-user receiver pb:type pb:size now))
    (add-xblob-1 xhash pbid current-user receiver 1 now 0)

    (if (= pb:xref 0)
	(db 'update "pblob" :id pbid :xref 1))

    xhash)

  (defmethod (find-blob x)
    (db 'find "pblob" :hash x :select "id,hash,type,size,xref,ctime"))

  (defmethod (find-xblob x)
    (db 'first "SELECT 
xb.id AS id,
xb.pbid AS pbid,
xb.xhash AS xhash,
xb.ctime AS ctime,
xb.creator AS creator,
xb.receiver AS receiver,
pb.type AS type,
pb.size AS size
FROM xblob xb LEFT JOIN pblob pb ON xb.pbid=pb.id
WHERE xb.xhash=?" x))

  (defmethod (find-postable hash)
    (db 'first "SELECT
bp.xhash AS xhash,
bp.ctime AS ctime,
bp.rcpt  AS receiver,
pb.type  AS type,
pb.size  AS size,
pb.id    AS pbid
FROM blobpost bp LEFT JOIN pblob pb ON bp.pbid=pb.id
WHERE bp.xhash=?"
     hash))
  
 
  (defmethod (send-xblob-to-output out x)
    (define pbid x:pbid)
    (define type x:type)
    (define size x:size)
    (define ts x:ctime)

    (define blob-input (open-blob-input pbid))
    (define shared-secret (get-shared-secret x:creator x:receiver))
    (define bytecnt
      (if shared-secret
	  (encrypt-from-input blob-input out size "aes-256-cfb8"
			      shared-secret (sha256 (concat type size ts)))
	  (pump blob-input out size)))
    (if (not (= bytecnt size))
	(error "send xblob bad size"))

    (close blob-input)
    )

  (defmethod (open-blob-input id)
    (db 'open-blob-input "pblob" "content" id)
    )

  (defmethod (open-blob-output id)
    (db 'open-blob-output "pblob" "content" id)
    )
  

  (define (process-sexp-blob x)
      (define input false)
      (db 'begin-transaction)
      (match
       (catch
	(let []
	  (set! input (open-blob-input x:pbid))
	  (define content (read input))
	  (process-sexp x:creator x:hash content)
	  (db 'update "xblob" :id x:id :status 1)
	  (close input)
	  (set! input false)
	  (db 'commit)))
       [(error &rest e)
	(db 'rollback)
	(if input (close input))
	;; Mark the entry as error, so it should not be processed again
	(db 'update "xblob" :id x:id :status 2)
	(println "Process blob error: " e)]))

  (define (touch-note hash)
    ;; If note <hash> doesn't exist in note table,
    ;; create a place holder. Return the note id.
    ;; Otherwise return the note id that exists.
    ;; If hash is empty return 0.
    (if (or (null? hash) (eq? hash undefined) (eq? hash ""))
	(return 0))

    (define x (db 'find "note" :hash hash :select "id"))
    (if (not (null? x)) (return (alist-get x 'id)))
    (db 'insert "note" :hash hash :mtime 0 :ctime 0 :status 0))

  (define (touch-user uuid)
    ;; Create a place holder if uuid doesn't exist yet
    (if (eq? uuid "") (error "Invalid uuid"))
    (define x (db 'find "user" :uuid uuid :select "id"))
    (if (null? x)
	(db 'insert "user" :uuid uuid :mtime 0 :ctime 0)
	(alist-get x 'id)))


  (define (get-subject-line x)
    (define pos (string-find x "\n"))
    (if pos
	(set! x (substring x 0 pos)))
    (if (> (string-length x) 72)
	(substring x 0 72)
	x))
  
  (define (update-note-rev note-id rev-id rev-mtime content user-id)
    (define x (db 'find "note" :id note-id :select "mtime"))
    (define mtime (alist-get x 'mtime))
    (if (and (number? mtime) (>= mtime rev-mtime))
	(return))
    (db 'update "note" :id note-id :uid user-id :revid rev-id :mtime rev-mtime :status 1)
    (define subject (get-subject-line content))    
    (db 'query "INSERT OR REPLACE INTO notetext (rowid,subject,content) VALUES(?,?,?)"
	note-id subject content)
    )


  (define (ref-included-blobs hash content)
    (define blob-id (get-blob-id hash))
    (define blob-refs (find-blob-refs content))
    (dolist (x blob-refs)
	    (define y (get-blob-id x))
	    (if y (add-blob-ref blob-id y))))
  
  (define (process-note from note-hash uuid timestamp action target origin content)
    ;; Process a note from sexp blob.
    ;;
    ;; Remember that notes can be processed out of order, because a note can refer to
    ;; another one that doesn't exist in the system yet. Therefore, we need to
    ;; create place holder for non-existent notes.
    ;;    Typically =from= is same as =uuid=. But if this note is forwarded to us,
    ;; then =from= may not equal to =uuid=. The authencity of author could be tracked
    ;; in xblob record.

    (println "PROCESS: " note-hash)
    ;;(println "Content: " content)

    ;; If note-hash exists in notelog, it means that the entry is already
    ;; processed. We are done.
    (if (db 'has? "notelog" :hash note-hash)
	(begin
	  (println "Already exists: " note-hash)
	  (return)))

    (ref-included-blobs note-hash content)
    
    (define target-id (touch-note target))
    (define user-id (touch-user uuid))
    (define note-id)
    (define log-id (db 'insert "notelog"
		       :hash note-hash
		       :uid user-id
		       :action action
		       :target target
		       :origin origin
		       :content content
		       :ctime timestamp))
    (cond
     [(eq? action "add")
      ;; what if an edit is already processed
      (set! note-id (db 'insert-or-update "note"
	  :hash note-hash
	  :uid user-id
	  :ctime timestamp
	  :brid 0
	  :exid target-id
	  :annid 0
	  :status 1))

      (update-note-rev note-id log-id timestamp content user-id)
      (db 'update "notelog" :id log-id :noteid note-id)
      ]
     
     [(eq? action "edit")
      (update-note-rev target-id log-id timestamp content user-id)
      (db 'update "notelog" :id log-id :noteid target-id)
      ]
     
     [(eq? action "branch")
      (set! note-id (db 'insert-or-update "note"
	  :hash note-hash
	  :uid user-id
	  :ctime timestamp
	  :brid target-id
	  :exid 0
	  :annid 0
	  :status 1))
      (update-note-rev note-id log-id timestamp content user-id)
      (db 'update "notelog" :id log-id :noteid note-id)      
      ]

     [(eq? action "move")
      ;; origin -- the note to be relocated
      ;; target -- under which the origin will be moved
      (define origin-note (db 'find "note" :hash origin))
      (if (null? origin-note)
          (error "No such note" origin))
      (if (= target-id origin-note:id)
          (set! target-id 0))
      (cond
       [(eq? content "branch")
        (db 'update "note"
            :id origin-note:id
            :brid target-id
            :exid 0
            :annid 0
            :status 1)]
       [(eq? content "thread")
        (db 'update "note"
            :id origin-note:id
            :brid 0
            :exid target-id
            :annid 0
            :status 1)]
       [(eq? content "annotate")
        (db 'update "note"
            :id origin-note:id
            :brid 0
            :exid 0
            :annid target-id
            :status 1)]
       [else
        (error "Bad move type" content)])
      (db 'update "notelog" :id log-id :noteid origin-note:id)
      ]
     
     [(eq? action "annotate")
      (set! note-id (db 'insert-or-update "note"
	  :hash note-hash
	  :uid user-id
	  :ctime timestamp
	  :brid 0
	  :exid 0
	  :annid target-id
	  :status 1))
      (update-note-rev note-id log-id timestamp content user-id)
      (db 'update "notelog" :id log-id :noteid note-id)      
      ]
     
     [else
      (error "Bad action")])
    ;; End of process-note
    )

  (define (find-user-incomplete x)
    (db 'first "SELECT id,uuid,role FROM user WHERE uuid like ?"
                             (concat x "%")))

  (define (get-blob-id x)
    (define y (db 'first "SELECT id FROM pblob WHERE hash=?" x))
    (if (null? y) false y:id))
  

  (defmethod (get-user-host uuid)
    (define x (db 'first "SELECT 
u.id       AS uid,
h.uuid     AS uuid,
h.ip       AS ip, 
h.port     AS port,
h.type     AS type,
h.contract AS contract,
h.retry    AS retry 
FROM user u LEFT JOIN host h ON u.id=h.uid 
WHERE u.uuid=?" uuid))
    x)

  (defmethod (set-host uid host ip port &optional type contract)
    (if (string? uid)
	(set! uid (find-user-id uid)))
    (if (not type) (set! type "hub"))
    (if (or (not contract)
	    (eq? contract ""))
	(set! contract ()))
    (if (db 'has? "host" :uid uid)
	(db 'update "host"
	    :uid uid :type type :uuid host :ip ip :port port
	    :contract contract
	    :mtime (time))
	(db 'insert "host"
	    :uid uid :type type :uuid host :ip ip :port port
	    :contract contract	    
	    :ctime (time))))



  (define (list-blob-tree id)
    (db 'query "with recursive a(blobid) AS (
select ?
union 
select 
  refid AS blobid
  FROM blobref JOIN a
  ON blobref.blobid = a.blobid
  order by blobid
)
SELECT 
  blobid AS id,
  pblob.type AS type,
  pblob.size AS size 
FROM a LEFT JOIN pblob ON a.blobid=pblob.id
" id))
  

  (define (process-sexp from hash x)
    (let [(action (car x))]
      (case action
	[note (apply process-note (cons from (cons hash (cdr x))))]
	[chat (apply process-chat (cons from (cons hash (cdr x))))]
	[file (apply process-file (list from hash (cdr x)))]
	[ledger (apply process-ledger (list from hash (cdr x)))]
	[user (apply process-user (list from hash (cdr x)))]
	[else (error "Invalid action:" action)])))

  (define (get-ledger-account-id x)
    (define x (db 'find "ledger_account" :hash x))
    (if (null? x) false x:id))
  (define (get-ledger-unit-id x)
    (define x (db 'find "ledger_unit" :hash x))
    (if (null? x) false x:id))
  (define (get-ledger-txid x)
    (define x (db 'find "ledger_transaction" :hash x))
    (if (null? x) false x:id))

  (define (process-ledger from hash x)
    (define u (car x))
    (define uid (touch-user u))
    (define ts (cadr x))
    (define lg false)
    (define lhash (caddr x))
    (if (not (null? lhash))
        (set! lg (db 'find "ledger" :hash lhash)))

    (match (cdddr x)
           [(add name currency)
            (db 'insert "ledger"
                :hash hash
                :name name
                :currency currency
                :ctime ts
                :creator uid)
            (define lgid (db 'last-insert-id))
            (db 'insert "ledger_log"
                :hash hash
                :creator uid
                :ctime ts
                :ledger_id lgid
                :name name)
            ]
           [(edit name icon)
            (db 'update "ledger"
                :id lg:id
                :name name
                :icon icon)
            (db 'insert "ledger_log"
                :hash hash
                :creator uid
                :ctime ts
                :ledger_id lg:id
                :name name
                :icon icon)
            ]
           [(delete)
            (if (not (eq? from current-space))
                (error "Only owner can delete ledger"))
            (db 'update "ledger"
                :id lg:id
                :status 0)
            (db 'insert "ledger_log"
                :hash hash
                :creator uid
                :ctime ts
                :ledger_id lg:id
                :name "DELETED")
            ]

           [(add-account name type parent)
            (define p (or (get-ledger-account-id parent) 0))
            (if (and (not (eq? type 1))
                     (not (eq? type 2)))
                (error "Bad type"))
            (db 'insert "ledger_account"
                :hash hash
                :name name
                :parent_id p
                :ledger_id lg:id
                :type type
                :ctime ts
                :creator uid)
            (define aid (db 'last-insert-id))
            (db 'insert "ledger_account_log"
                :hash hash
                :name name
                :parent_id p
                :account_id aid
                :ctime ts
                :creator uid)
            ]
           [(edit-account ahash name parent icon description)
            (define aid (get-ledger-account-id ahash))
            (define p (or (get-ledger-account-id parent) 0))
            (db 'update "ledger_account"
                :id aid
                :name name
                :parent_id p
                :icon icon
                :description description)
            (db 'insert "ledger_account_log"
                :account_id aid
                :hash hash
                :name name
                :icon icon
                :description description
                :parent_id p
                :ctime ts
                :creator uid)
            ]
           [(delete-account ahash)
            (define aid (get-ledger-account-id ahash))
            (db 'update "ledger_account"
                :id aid
                :status 0)
            (db 'insert "ledger_account_log"
                :account_id aid
                :hash hash
                :name "DELETED"
                :ctime ts
                :creator uid)
            ]

           [(add-unit code name type parent)
            (define p (or (get-ledger-unit-id parent) 0))
            (if (and (not (eq? type 1))
                     (not (eq? type 2)))
                (error "Bad type"))
            (db 'insert "ledger_unit"
                :hash hash
                :code (if (eq? type 2) () code)
                :name name
                :parent_id p
                :ledger_id lg:id
                :type type
                :ctime ts
                :creator uid)
            (define unit-id (db 'last-insert-id))
            (db 'insert "ledger_unit_log"
                :hash hash
                :name name
                :parent_id p
                :unit_id unit-id
                :ctime ts
                :creator uid)
            ]
           [(edit-unit ahash name parent icon description)
            (define unit-id (get-ledger-unit-id ahash))
            (define p (or (get-ledger-unit-id parent) 0))
            (db 'update "ledger_unit"
                :id unit-id
                :name name
                :parent_id p
                :icon icon
                :description description)
            (db 'insert "ledger_unit_log"
                :unit_id unit-id
                :hash hash
                :name name
                :icon icon
                :description description
                :parent_id p
                :ctime ts
                :creator uid)
            ]
           [(delete-unit ahash)
            (define aid (get-ledger-unit-id ahash))
            (db 'update "ledger_unit"
                :id aid
                :status 0)
            (db 'insert "ledger_unit_log"
                :unit_id aid
                :hash hash
                :name "DELETED"
                :ctime ts
                :creator uid)
            ]
           [(add-transaction comment prev type details)
            (define p (or (get-ledger-txid prev) 0))
            (if p
                (db 'update "ledger_transaction"
                    :id p
                    :status 0))
            (db 'insert "ledger_transaction"
                :hash hash
                :ledger_id lg:id
                :origin_txid p
                :comment comment
                :type type
                :ctime ts
                :creator uid)
            (define txid (db 'last-insert-id))
            (let loop [(u details) (total 0) (balance 0)]
              (cond
               [(null? u)
                (if (>= (abs balance) 0.01)
                    (error "Unbalanced"))
                (set! total (/ total 2))
                (db 'update "ledger_transaction"
                    :id txid
                    :total total)
                ]
               [else
                (match (cons 'detail u)
                       [(detail acc unit quantity price txdate comment &rest details)
                        (db 'insert "ledger_transaction_detail"
                            :txid txid
                            :account_id (get-ledger-account-id acc)
                            :unit_code unit
                            :quantity quantity
                            :price price
                            :txdate txdate
                            :comment comment
                            )
                        (loop details (+ total (abs (* quantity price)))
                              (+ balance (* quantity price)))
                        ]
                       [else
                        (error "Bad detail")])]))
            ]
           [(cancel-transaction comment prev)
            (define p (or (get-ledger-txid prev) 0))
            (if p
                (db 'update "ledger_transaction"
                    :id p
                    :status 0))
            (db 'insert "ledger_transaction"
                :hash hash
                :ledger_id lg:id
                :origin_txid p
                :comment comment
                :total 0
                :type 3 ;; cancel previous one
                :ctime ts
                :creator uid)
            ]
           [else
            (error "Invalid ledger action")])
           )

  
  (define (get-file-id x)
    (if (eq? x "")
	0
	(get (db 'first "SELECT id FROM file WHERE hash=?" x) 'id)))

  (define (process-file from hash x)
    (when (db 'has? "filelog" :hash hash)
	  (println "File log already exists:" hash)
	  (return))
    (define u (db 'find "user" :uuid from :select "id,role"))
    (define user-id u:id)
    (define x-id (get-blob-id hash))
    (match x
	   [(add target name blob-hash ts)
	    (define target-id (get-file-id target))
	    (define blob-id (get-blob-id blob-hash))
	    (define file-id (db 'insert "file"
				:hash hash
				:name name
				:dirid target-id
				:blobid blob-id
				:status 1
				:mtime ts
				:ctime ts))
	    (define log-id (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid file-id
		:action 'add
		:target target
		:ctime ts))

	    (db 'query "INSERT OR IGNORE INTO blobref (blobid,refid) 
VALUES (?,?)" x-id blob-id)
	    ]

	   [(mkdir target name ts)
	    (define target-id (get-file-id target))
	    (define file-id (db 'insert "file"
				:hash hash
				:name name
				:isdir 1
				:dirid target-id
				:status 1
				:mtime ts
				:ctime ts))
	    (define log-id (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid file-id
		:action 'mkdir
		:target target
		:ctime ts))
	    ]

	   [(rename file-hash name ts)
	    (define file-id (get-file-id file-hash))
	    (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid file-id
		:action 'rename
		:target name
		:ctime ts)
	    (define x (db 'first "SELECT target FROM filelog WHERE fileid=? AND action='rename'
ORDER BY ctime DESC LIMIT 1" file-id))
	    (db 'update "file"
		:hash file-hash
		:name x:target)
	    ]
	   
	   [(moveto target file-hash ts)
	    (define file-id (get-file-id file-hash))
	    (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid file-id
		:action 'moveto
		:target target
		:ctime ts)
	    (define x (db 'first "SELECT target FROM filelog
WHERE fileid=? AND action = 'moveto' ORDER BY ctime DESC LIMIT 1"
			  file-id))
	    (define target-id (get-file-id x:target))
	    (db 'update "file"
		:hash file-hash
		:dirid target-id)
	    ]
	   
	   [(update file-hash blob-hash ts)
	    (define f (db 'find "file" :hash file-hash))
	    (define blob-id (get-blob-id blob-hash))
	    (if (< f:mtime ts)
		(db 'update "file"
		    :id f:id
		    :blobid blob-id
		    :mtime ts))
	    (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid f:id
		:action 'update
		:target blob-hash
		:ctime ts)
	    (db 'query "INSERT OR IGNORE INTO blobref (blobid,refid) 
VALUES (?,?)" x-id blob-id)
	    
	    ]
	   [(remove file-hash ts)
	    (define f (db 'find "file" :hash file-hash))
	    (db 'update "file"
		:id f:id
		:status 0)
	    (db 'insert "filelog"
		:hash hash
		:uid user-id
		:fileid f:id
		:action 'remove
		:ctime ts)
	    ]
	   [else
	    (error "Invalid file action")]))

  (define (process-chat sender hash action from rcpt ts target content)
    (when (db 'has? "chatlog" :hash hash)
	(println "Chat already exists:" hash)
	(return))

    (if (not (eq? sender from))
	(error "Chat message sender mismatch"))

    ;; Since the sender is able to write to our space
    ;; It should be in our space already
    (define sender-id (find-user-id sender))
    (if (not sender-id)
	(error "Sender not found"))

    (define log-id (db 'insert "chatlog"
		       :hash hash
		       :uid sender-id
		       :action action
		       :target target
		       :content content
		       :ctime ts))

    (if (eq? content "/read")
	(begin
	  (if (eq? from current-user)
	      (let [(x (db 'find "chat" :hash target))]
		(if (not (null? x))
		    (if (< x:lastread ts)
			(db 'update "chat" :id x:id :lastread ts))
		    )))
	  (return)
	  ))

    (define chat-uid 0)
    (define chat-id)

    ;; For chats visible to all members, rcpt is ().
    (cond
     [(eq? rcpt current-user) (set! chat-uid sender-id)]
     [(null? rcpt)]
     [else (set! chat-uid (find-user-id rcpt))])

    ;; Ensure chat entry exists
    (if (null? target)
	(set! chat-id (db 'insert "chat"
			  :hash hash
			  :uid chat-uid
			  :ctime ts
			  :lastlog log-id
			  :lastread (if (eq? from current-user) ts 0)))
	;; We should look in chatlog instead of chat
	;; so that we may construct a hierachical discussion
	;; if we want to
	(let [(x (db 'find "chatlog" :hash target))]
	  (if (null? x)
	      (error "Chat not found")
	      (begin
		(set! chat-id x:chatid)
		(if (eq? from current-user)
		    (db 'update "chat"
			:id x:chatid
			:lastlog log-id
			:lastread ts)
		    (db 'update "chat"
			:id x:chatid
			:lastlog log-id)))
	      )))

    (db 'update "chatlog" :id log-id :chatid chat-id)
    (cond
     [(eq? action 'set-title)
      (db 'update "chat" :id chat-id :title content)]
     [(eq? action 'add)]
     [else
      (error "Invalid chat action:" action)])

    (ref-included-blobs hash content))
  
  ;; Always use current creator
  ;; Adding a type 1 blob with a sexp
  ;; Apply the sexp on our storage and only
  ;; add it to blob storage when there is no errors
  (defmethod (add-sexp-blob x &optional receiver)
    (define out (open-output-buffer))
    (write x out)
    (define ob (get-output-buffer out))
    (define blob-hash (hex-encode (sha256 ob)))
    (db 'begin-transaction)
    (match
     (catch
      (add-plain-blob blob-hash "text/x-twk" (length ob) ob)
      (process-sexp creator blob-hash x)
      (add-xblob blob-hash (or receiver ()))
      (close out)
      (db 'commit))
     [(error &rest x)
      (db 'rollback)
      false]
     [else blob-hash]))
  
  ;;------------------------------------------------------------
  ;; User Management
  ;; Since we don't want to keep all histories
  ;; we only keep the latest entry
  ;; and previous entry are deleted.
  ;; perhaps we should use set name='' to indicate deletion of an entry
  (define (process-user from hash x)
    (match x
	   [(del uuid ts)
	    (if (not (eq? from current-space))
		(error "Not space owner"))
	    (db 'remove "user" :uuid uuid)
	    ]
	   [(set-role uuid role ts)
	    (if (not (eq? from current-space))
		(error "Not space owner"))
	    (db 'update "user" :uuid uuid :role role)
	    ]
	   [(set-fav uuid type target fav ts)
	    (if (not (eq? uuid from))
		(error "Not owner"))
	    (define uid (find-user-id uuid))
	    (define id (get-blob-id hash))
	    (define blob-id (get-blob-id target))
	    (define x (db 'find "userfav" :uid uid :type type :target target))
	    (if (null? x)
		(db 'insert "userfav" :uid uid :type type :target target
		    :hash hash :fav fav :mtime ts :ctime ts)
		(if (< x:mtime ts)
		    (db 'update "userfav" :id x:id :mtime ts :fav fav :hash hash)))
	    (db 'query "INSERT OR IGNORE INTO blobref (blobid,refid) VALUES (?,?)" id blob-id)
	    ]
	   [(req uuid pk ts)  ;; Visible to host, so we must not include name
	    (if (not (eq? uuid from))
		(error "Not from its owner"))
	    (if (not (db 'has? "user" :uuid uuid))
		(db 'insert "user"
		    :uuid uuid
		    :pk pk
		    :role 4
		    :mtime 0
		    :ctime ts))
	    ]
	   [(set-req-limit max-req ts)
	    (if (not (eq? from current-space))
		(error "Not space owner"))
	    ;; host visible
	    ]
	   [(add uuid pk vk name ts)
	    (if (not (eq? from current-space))
		(error "Not space owner"))
	    (if (not (db 'has? "user" :uuid uuid))
		(db 'insert "user"
		    :uuid uuid
		    :pk pk
		    :vk vk
		    :name name
		    :mtime 0 ;; set-profile will always have higher priority
		    :ctime ts))
	    ]
	   [(set-profile uuid name fullname email photo ts)
            ;; user profile can be self updated or by space owner
            ;; Other users have no right
	    (if (and (not (eq? from uuid))
                     (not (eq? from current-space)))
		(error "Can not update profile"))
	    (let [(u (db 'find "user" :uuid uuid :select "id,mtime"))]
	      (if (null? u)
		  (error "User not found"))
	      (if (> ts u:mtime)
		  (begin
		    (db 'update "user" :uuid uuid
			:name name
			:fullname fullname
			:email email
			:photo photo
			:mtime ts)
		    (db 'insert "profilelog" :uid u:id :hash hash :ctime (time))
		    )))
	    (let [(photo-hash (get-photo-blob-hash photo))]
	      (if (not photo-hash) (return))
	      (define id (get-blob-id hash))
	      (define photo-id (get-blob-id photo-hash))
	      (if photo-id
		  (db 'query "INSERT OR IGNORE INTO blobref (blobid,refid) VALUES (?,?)" id photo-id))
	      )]
	   [else (error "Bad user sexp")]
	   ))

  (define (get-photo-blob-hash photo)
    (define i (string-find photo "blob/"))
    (if (not i) (return false))
    (define photo-hash (substring photo (+ i 5)))
    photo-hash)

  ;; -------------------------------------------------------------------
  (this))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; Extensions
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define (space-storage-sync-extension)

  (defmethod register-instance (db 'prepare "INSERT OR IGNORE INTO blobsync(uuid,instance,ctime) VALUES(?,?,?)"))

  (defmethod (get-instance uuid instance)
    (db 'first "SELECT id,pos FROM blobsync WHERE uuid=? AND instance=?"
	uuid instance))

  ;; (save-instance-pos pos id)
  (defmethod save-instance-pos (db 'prepare "UPDATE blobsync SET pos=? WHERE id=?"))

  ;; (list-pushable-xblobs <from> <inst>)
  (defmethod list-pushable-xblobs (db 'prepare "
SELECT 
  xb.id AS id,
  xb.xhash AS xhash
FROM xblob xb
WHERE xb.pbid > 0 AND xb.id>? AND (xb.inst <> ? OR xb.inst IS NULL) ORDER BY xb.id ASC LIMIT 40"))

  ;; (list-removable-xblobs)
  (defmethod list-removable-xblobs-1 (db 'prepare "
SELECT 
  xb.id AS id,
  xb.xhash AS xhash
FROM xblob xb
WHERE xb.pbid = 0 ORDER BY id ASC LIMIT 40"))


  (defmethod (max-xblob-id)
    (define x (db 'first "SELECT IFNULL(MAX(id),0) AS maxid FROM xblob"))
    (if (null? x) 0 x:maxid))

  (defmethod (add-xblob-from-input in info instance-id)
    (define type info:type)
    (define size info:size)
    (define ts info:ctime)

    (db 'query "INSERT INTO pblob (type, size, ctime, content) 
VALUES (?,?,?,ZEROBLOB(?))"
	type size (time) size)
    (define id (db 'last-insert-id))
    (define b-o (db 'open-blob-output "pblob" "content" id))
    (define sha256-o (open-sha256-output b-o))

    (define shared-secret (get-shared-secret info:creator info:receiver))
    (define insize
      (if shared-secret
	  (decrypt-from-input in sha256-o size "aes-256-cfb8" shared-secret (sha256 (concat type size ts)))
	  (pump in sha256-o size)))
    (if (not (= insize size))
	(error "Add xblob bad size"))
    
    (define hash (hex-encode (sha256-output-finalize sha256-o)))
    (close sha256-o)
    (close b-o) ;; Blob must be closed before calculating xhash

    ;; Verify the written blob 
    (define xhash (calc-xhash id info:creator info:receiver type size ts))
    (if (not (eq? info:xhash xhash))
	(error "Hash mismatch" info:xhash xhash))

    ;; If already exists, use the previous one, delete the current one
    (define x (db 'first "SELECT id,type,size FROM pblob WHERE hash=?" hash))
    (if (or (null? x)
	    (not (eq? x:size size))
	    (not (eq? x:type type)))
	(db 'query "UPDATE pblob SET hash=? WHERE id=?" hash id)
	(begin
	  (db 'query "DELETE FROM pblob WHERE id=?" id)
	  (set! id x:id)))
    
    (define status (if (eq? info:type "text/x-twk") 0 1))
    (add-xblob-1 info:xhash id info:creator info:receiver status ts instance-id)
    (define xblobid (db 'last-insert-id))
    
    (db 'query "UPDATE pblob SET xref=1 WHERE id=? AND xref=0" id)
    (if (eq? type "text/x-twk")
	(process-sexp-blob
	 (list :id xblobid
	       :pbid id
	       :type type
	       :hash hash
	       :creator info:creator
	       :receiver info:receiver)))
    
    true)
  )

(define (space-storage-process-extension)
  (define list-unprocessed-blobs (db 'prepare "
SELECT 
  xb.id AS id,
  xb.pbid AS pbid,
  pb.type AS type,
  pb.hash AS hash,
  xb.creator AS creator,
  xb.receiver AS receiver
FROM xblob xb LEFT JOIN pblob pb ON xb.pbid = pb.id 
WHERE xb.status=0 AND xb.pbid > 0
ORDER BY xb.id ASC LIMIT 10"))
  
  (defmethod (process-blobs)
    (let loop [(u (list-unprocessed-blobs))]
      (if (null? u) (return))
      (dolist (x u)
              (if (eq? x:type "text/x-twk")
                  (process-sexp-blob x)
                  (db 'update "xblob" :id x:id :status 1)))
      (loop (list-unprocessed-blobs))))

  (defmethod (reprocess-all)
    (db 'exec "
BEGIN TRANSACTION;
DELETE FROM note;
DELETE FROM notelog;
DELETE FROM chat;
DELETE FROM chatlog;
DELETE FROM file;
DELETE FROM filelog;
DELETE FROM userfav;
DELETE FROM ledger;
DELETE FROM ledger_log;
DELETE FROM ledger_unit_log;
DELETE FROM ledger_unit;
DELETE FROM ledger_transaction;
DELETE FROM ledger_transaction_detail;
DELETE FROM ledger_account;
DELETE FROM ledger_account_log;
UPDATE xblob SET status = 0;
COMMIT;
")
    (process-blobs)
    true)

  (defmethod (next-blobpost)
    (define x (db 'first "SELECT 
u.id    AS uid,
b.rcpt  AS rcpt,
h.uuid  AS host,
h.port  AS port,
h.ip    AS ip,
h.retry AS retry,
h.type  AS type
FROM blobpost b
LEFT JOIN user u ON b.rcpt=u.uuid
LEFT JOIN host h ON u.id=h.uid
WHERE b.sent = 0 
  AND b.xhash IS NOT NULL
  AND (h.retry IS NULL OR h.retry < ?)
ORDER BY b.id ASC 
LIMIT 1" (time)))
    x)

  (defmethod (list-postable rcpt)
    (define u (db 'query "SELECT xhash FROM blobpost
WHERE sent = 0 AND rcpt=? ORDER BY id ASC LIMIT 40" rcpt))
    (map ^{[x] x:xhash} u))

  (defmethod (clear-host-retry &optional uuid)
    (when (not uuid)
	(db 'query "UPDATE host SET retry=NULL,retrycnt=0 WHERE uuid IS NOT NULL")
	(return))
    (define x (db 'first "SELECT u.id AS uid, h.retry AS retry 
FROM user u LEFT JOIN host h ON u.id=h.uid WHERE u.uuid=?" uuid))
    (if (not (or (null? x)
		 (eq? x:retry undefined)))
	(db 'query "UPDATE host SET retry=NULL,retrycnt=0 WHERE uid=?" x:uid))
    )

  (define (calculate-retry-interval n)
    (cond
     [(<= n 0) 300] ;; First retry: 5 minutes later
     [(<= n 5) (* 600 n)] ;; Then 10,20,30,40,50
     [(<= n 10) 3600] ;; Then every hour for another 5 hours
     [(<= n 20) (* 24 3600)] ;; Then every day for another 10 days
     [else (* 24 3600 7)])) ;; Finally, every week. 

  (defmethod (inc-host-retry uuid)
    (define x (db 'first "SELECT 
u.id AS uid, h.retry AS retry, h.retrycnt AS retrycnt 
FROM user u LEFT JOIN host h ON u.id=h.uid WHERE u.uuid=?" uuid))

    (if (not (null? x))
	(let [(cnt (if (eq? x:retrycnt undefined) 0 x:retrycnt))]
	  (db 'query "UPDATE host SET retry=?,retrycnt=? WHERE uid=?"
	      (+ (time) (calculate-retry-interval cnt))
	      (+ 1 cnt)
	      x:uid))))

  (defmethod (set-posted rcpt blobs)
    (dolist (x blobs)
	    (db 'query "UPDATE blobpost SET sent=? WHERE xhash=? AND sent=0"
		(time) x)))
  
  )

(define (space-storage-ui-extension)

  (defmethod (count-unsent)
    (db 'query "SELECT 
u.uuid AS uuid,
u.name AS name,
u.photo AS photo,
COUNT(b.xhash) AS cnt,
h.retry AS retry
FROM host h LEFT JOIN user u ON h.uid=u.id
LEFT JOIN blobpost b ON b.rcpt=u.uuid 
WHERE b.sent=0 AND b.xhash IS NOT NULL
GROUP BY u.uuid")
    )

  (defmethod (remove-unsent uuid)
    (db 'query "DELETE FROM blobpost WHERE rcpt=? AND sent=0" uuid)
    )

  (defmethod (count-unsent-total)
    (define x (db 'first "SELECT 
COUNT(*) AS cnt FROM blobpost WHERE sent=0 AND xhash IS NOT NULL"))
    x:cnt)


  (define (add-to-post-queue rcpt blobid now)
    (if (db 'has? "blobpost" :rcpt rcpt :pbid blobid)
	(return))
    (println "Add post queue " rcpt " #" blobid)
    (define u (list-blob-tree blobid))
    (dolist (x u)
	    ;; If we've sent the same blob to the same recipient
	    ;; don't create a new post here
	    (if (db 'has? "blobpost" :rcpt rcpt :pbid x:id)
		(return))
	    (define xhash (calc-xhash x:id current-user rcpt x:type x:size now))
	    (db 'query "INSERT OR IGNORE INTO 
blobpost (xhash, rcpt, ctime, pbid) VALUES (?,?,?,?)"
		xhash rcpt now x:id)
	    ))
  
  (define (process-mentions hash content ts)
    (define blob (db 'find "pblob" :hash hash :select "id"))
    (if (null? blob)
	(error "Blob not found"))
    (define mentions (find-mention-refs content))
    (let loop [(u mentions)]
      (if (not (null? u))
	  (begin
	    (let [(rcpt (find-user-incomplete (car u)))]
	      (if (and (not (null? rcpt))
                       (not (eq? rcpt:uuid creator))
                       (eq? rcpt:role 1))
		  (begin
		    (send-profile rcpt:uuid)
		    (add-to-post-queue rcpt:uuid blob:id ts)))
	      )
	    (loop (cdr u))
	    )))
    )
  
    ;;--------------------------------------------------------------------
  ;; create-note
  ;; action: add, edit, annotate, branch
  ;; target: note hash. where to add after, which to be annotated, which
  ;;         to be branched from
  ;; origin: base rev hash. hash of the revision where this note originated from
  ;;         Used for tracking changes.
  (defmethod (create-note action target origin content)
    (check-content-length content)
    (define ts (time))
    (define x (add-sexp-blob (list 'note creator ts action target origin content)))
    (if (not x) (return false))
    (if (eq? current-user current-space)
        (process-mentions x content ts))
    ;; Check if this blob needs to be sent to other repicients
    (db 'first "SELECT * FROM note WHERE hash=?" x)
    )

  (defmethod (update-note target origin content)
    (check-content-length content)
    (define ts (time))
    (define x (add-sexp-blob (list 'note creator ts "edit" target origin content)))
    ;; Check if this blob needs to be sent to other repicients
    (if (not x) (return false))
    (if (eq? current-user current-space)
        (process-mentions x content ts))
    (list :revhash x))

  (define (complete-hash x)
    (if (= (string-length x) 64)
        (return x))

    (define r (db 'first "SELECT id,hash FROM note WHERE hash like ?"
                             (concat x "%")))
    (if  (null? r)  
         x
         (cdr (assoc 'hash r))))

  (defmethod (move-note target origin type)
    (set! target (complete-hash target))
    (define ts (time))
    (define x (add-sexp-blob (list 'note creator ts "move" target origin type)))
    (list :moved x))
  
  (defmethod (get-note-by-id id)
    (db 'first "SELECT
note.hash AS hash,
notetext.subject AS subject
FROM note LEFT JOIN notetext ON note.id = notetext.rowid
	WHERE note.id=?" id))

  (defmethod (get-note-subject note-hash)
    (set! note-hash (complete-hash note-hash))
    (db 'first "SELECT
notetext.subject AS subject
FROM note LEFT JOIN notetext ON note.id = notetext.rowid
	WHERE note.hash=?" note-hash))
  
  (defmethod (get-thread-first id)
    (db 'first "
with recursive a(id) AS (
  values(?)
  UNION ALL 
  select exid AS id FROM a LEFT JOIN note ON a.id=note.id 
    WHERE note.exid > 0
  LIMIT 1000
)
SELECT 
  note.id AS id,
  note.hash AS hash,
  notetext.subject AS subject
FROM a LEFT JOIN note ON a.id=note.id
LEFT JOIN notetext ON a.id=notetext.rowid
ORDER BY a.id ASC LIMIT 1"
	 id))
  
  (defmethod (get-note note-hash)
    (let [(l (string-length note-hash))]
      (cond
       [(= l 64)]
       [(and (>= l 4) (< l 64))
        (set! note-hash (complete-hash note-hash))]
       [else (error "Bad note hash")]))
    (db 'first "
SELECT 
  note.hash AS hash,
  user.uuid AS creator,
  note.id AS id,
  notelog.hash AS revhash,
  notelog.content AS content,
  note.ctime AS ctime,
  note.mtime AS mtime
FROM note 
LEFT JOIN notelog ON note.revid = notelog.id 
LEFT JOIN user ON note.uid = user.id
WHERE note.hash=?"
                   note-hash)
    )

  (defmethod (search-notes search-expr offset limit &optional sort)
    (case sort
      ("mtime" (set! sort "note.mtime DESC, notetext.rank"))
      (else (set! sort "notetext.rank")))

    (define x (db 'first "SELECT COUNT(*) AS cnt FROM notetext 
WHERE notetext MATCH ?"	search-expr))
    (list
     x:cnt
     (db 'query "
SELECT 
  notetext.rowid AS id,
  note.hash AS hash,
  user.uuid AS uuid,
  highlight(notetext,1,'<','>') AS content,
  note.mtime AS mtime
FROM notetext 
LEFT JOIN note ON notetext.rowid=note.id
LEFT JOIN user ON note.uid=user.id
WHERE notetext MATCH ?
ORDER BY \{sort}
LIMIT \{limit}
OFFSET \{offset}"
	search-expr
    )))

  (define (is-favorite hash)
    (define x (db 'first "SELECT COUNT(*) AS cnt FROM userfav LEFT JOIN user ON userfav.uid=user.id WHERE target=? AND user.uuid=? AND fav>0"
		  hash current-user))
    (> x:cnt 0))

  ;;----------------------------------------------------------------------
  ;; List note by a note hash, or part of
  ;; It should not be a revision hash
  (defmethod (list-notes note-hash)
    (let [(l (string-length note-hash))]
      (cond
       [(= l 64)]
       [(and (>= l 4) (< l 64))
        (set! note-hash (complete-hash note-hash))]
       [else (error "Bad note hash")]))
    
    (define notes (db 'query "
WITH recursive a(id,ctime) AS (
  SELECT id,note.ctime AS ctime FROM note WHERE hash=?
  UNION ALL
  SELECT 
    note.id    AS id,
    note.ctime AS ctime
  FROM note JOIN a
  ON note.exid = a.id
  ORDER BY ctime DESC
  LIMIT 1000
)
SELECT    
 a.id            AS id,
 n.annid         AS commentid,
 n.brid          AS parentid,
 n.exid          AS threadid,
 n.hash          AS hash,
 notelog.hash    AS revhash,
 notelog.content AS content,
 n.mtime         AS mtime,
 n.ctime         AS ctime,
 user.uuid       AS creator,
 user.photo      AS photo
FROM a 
LEFT JOIN note n  ON a.id =  n.id
LEFT JOIN notelog ON n.revid = notelog.id
LEFT JOIN user    ON n.uid = user.id;
"   note-hash))

    (map ^{[x]
	   (cons
	    :isfav (is-favorite x:hash)
	    (cons
	     :branches (count-branches x:id)
	     (cons
	      :comments (count-comments x:id)
	      x)))
           } notes)
    )


  (define (count-branches id)
    (db 'count "note" :brid id))

  (define (count-comments id)
    (db 'count "note" :annid id))

  ;; ------------------------------------------------------------

  (defmethod (list-branches note-hash)
    (define x (db 'first "SELECT * FROM note WHERE hash=?"
                             note-hash))
    (if (null? x) (return x))
    (define note-id (cdr (assoc 'id x)))

    (db 'query "
SELECT 
  note.id AS id,
  note.hash AS hash,
  note.mtime AS mtime,
  note.ctime AS ctime,
  user.uuid AS  creator,
  notelog.content AS content,
  notelog.origin AS origin,
  notelog.hash AS revhash
FROM note 
LEFT JOIN notelog ON note.revid=notelog.id
LEFT JOIN user ON user.id=note.uid
WHERE brid=?"
                   note-id)
    )

  ;; ------------------------------------------------------------
  
  (defmethod (list-comments note-hash)

    (define x (db 'first "SELECT * FROM note WHERE hash=?"
                             note-hash))
    (if (null? x) (return x))
    (define note-id (cdr (assoc 'id x)))
    
    (define comments (db 'query "
SELECT 
  note.id   AS id,
  note.hash AS hash,
  note.annid AS commentid,
  note.mtime AS mtime,
  note.ctime AS ctime,
  user.uuid AS  creator,
  notelog.content AS content,
  notelog.origin AS origin,
  notelog.hash AS revhash
FROM note 
LEFT JOIN notelog ON note.revid=notelog.id 
LEFT JOIN user ON note.uid=user.id
WHERE annid=?"
                   note-id))

    (map ^{[x]
           (cons
            :isfav (is-favorite x:hash)
	    (cons
	     :comments (count-comments x:id)
	     x))
           } comments)
    
    )

  ;; ------------------------------------------------------------

  (defmethod (list-logs &optional note-hash offset limit)
    (if (not offset)
        (set! offset 0))
    (if (not limit)
        (set! limit 50))
    (if (or (not (integer? offset)) (not (integer? limit)))
        (error "Bad parameters"))
    (if note-hash
        (db 'query "
SELECT 
  notelog.id AS id,
  user.uuid AS uuid,
  user.photo AS photo,
  user.name AS name,
  note.hash AS noteid,
  notelog.hash AS revhash,
  notelog.action AS action,
  notelog.target AS target,
  notelog.origin AS origin,
  notelog.ctime AS ctime
FROM notelog 
LEFT JOIN note ON notelog.noteid=note.id
LEFT JOIN user ON notelog.uid=user.id
WHERE note.hash = ?
ORDER BY notelog.ctime DESC
LIMIT \{limit}
OFFSET \{offset} 
" note-hash)
        (db 'query "
SELECT 
  notelog.id AS id,
  user.uuid AS uuid,
  note.hash AS noteid,
  notelog.hash AS revhash,
  notelog.action AS action,
  notelog.target AS target,
  notelog.origin AS origin,
  notelog.ctime AS ctime
FROM notelog 
LEFT JOIN note ON notelog.noteid=note.id
LEFT JOIN user ON notelog.uid=user.id
ORDER BY notelog.ctime DESC
LIMIT \{limit}
OFFSET \{offset}
")))
  ;; -------------------------------------------------------------------

  (define (list-user-fav-notes uuid offset limit)
    (define cnt (get (db 'first "
SELECT 
  COUNT(*) AS cnt
FROM userfav
LEFT JOIN user ON userfav.uid=user.id
WHERE user.uuid = ? AND userfav.fav > 0 AND userfav.type='note'" uuid)
                   'cnt))
    (define u (db 'query "
SELECT 
  note.id   AS id,
  note.hash AS hash,
  note.exid AS threadid,
  note.brid AS parentid,
  note.annid AS commentid,
  note.mtime AS mtime,
  notetext.subject AS subject
FROM userfav
LEFT JOIN note ON note.hash = userfav.target
LEFT JOIN notetext ON notetext.rowid=note.id
LEFT JOIN user ON userfav.uid=user.id
WHERE user.uuid = ? AND userfav.fav > 0 AND userfav.type='note'
ORDER BY userfav.mtime DESC
LIMIT \{limit}
OFFSET \{offset} 
" uuid))

    (list cnt u))
  
  (defmethod (list-recent-notes type offset limit)
    (if (not offset)
        (set! offset 0))
    (if (not limit)
        (set! limit 50))
    (if (or (not (integer? offset)) (not (integer? limit)))
        (error "Bad parameters"))
    (define cnt (db 'count "note"))
    (define u
      (db 'query "
SELECT 
  note.id   AS id,
  note.hash AS hash,
  note.exid AS threadid,
  note.brid AS parentid,
  note.annid AS commentid,
  note.mtime AS mtime,
  notetext.subject AS subject,
  user.uuid AS creator,
  user.photo AS photo
FROM note
LEFT JOIN notetext ON notetext.rowid=note.id
LEFT JOIN user ON note.uid=user.id
ORDER BY note.mtime DESC
LIMIT \{limit}
OFFSET \{offset} "))
    (list cnt u))

  (defmethod (list-user-notes uuid type offset limit)
    (if (not offset)
        (set! offset 0))
    (if (not limit)
        (set! limit 50))
    (if (or (not (integer? offset)) (not (integer? limit)))
        (error "Bad parameters"))

    (if (eq? type "fav")
	(return (list-user-fav-notes uuid offset limit)))
    
    (define type-cond
      (case type
	["root" "note.exid=0 AND note.brid=0 AND note.annid=0"]
	[else "1=1"]))

    (define cnt (get (db 'first "
SELECT 
  COUNT(*) AS cnt
FROM note
LEFT JOIN user ON note.uid=user.id
WHERE user.uuid = ? 
 AND \{type-cond}" uuid) 'cnt))

    (define u(db 'query "
SELECT 
  note.id   AS id,
  note.hash AS hash,
  note.exid AS threadid,
  note.brid AS parentid,
  note.annid AS commentid,
  note.mtime AS mtime,
  notetext.subject AS subject
FROM note
LEFT JOIN notetext ON notetext.rowid=note.id
LEFT JOIN user ON note.uid=user.id
WHERE user.uuid = ? 
 AND \{type-cond}
ORDER BY note.mtime DESC
LIMIT \{limit}
OFFSET \{offset} 
" uuid))
    (list cnt u)
    )
  
  


  ;; -------------------------------------------------------------------


  (define (complete-revhash x)
    (define r (db 'first "SELECT id,hash FROM notelog WHERE hash like ?"
                             (concat x "%")))
    (if  (null? r)  
         x
         (cdr (assoc 'hash r))))

  (defmethod (get-note-rev revhash)
    (let [(l (string-length revhash))]
      (cond
       [(= l 64)]
       [(and (>= l 4) (< l 64))
        (set! revhash (complete-revhash revhash))]
       [else (error "Bad rev hash")]))
    (db 'first "
SELECT 
  note.hash AS noteid,
  user.uuid AS creator,
  notelog.id AS id,
  notelog.hash AS revhash,
  notelog.content AS content,
  notelog.origin AS origin,
  notelog.target AS target,
  notelog.ctime AS ctime
FROM notelog
LEFT JOIN note ON note.id = notelog.noteid
LEFT JOIN user ON notelog.uid = user.id
WHERE notelog.hash=?"
                   revhash)
    )


  
  (defmethod (add-contact name uuid pk &optional role)
    (if (not (null? (find-user uuid)))
        (error "User already exists"))
    (if (eq? name "") (set! name ()))
    (if (not role) (set! role 1))
    (add-user name uuid pk)
    (set-user-role uuid role)
    true)

  ;; Adding a user
  (defmethod (add-user name uuid pk)
    (if (not (eq? creator space-id))
	(error "Not space owner"))
    (if (not (eq? uuid (pubkey->address (hex-decode pk))))
	(error "UUID & PK Mismatch"))
    (if (db 'has? "user" :uuid uuid)
	(error "User already exists"))
    (add-sexp-blob
     (list 'user 'add uuid pk () name (time))))

  (defmethod (update-user uuid name fullname email photo)
    (if (and (not (eq? creator uuid))
             (not (eq? creator current-space)))
	(error "Can not update user"))
    (add-sexp-blob
     (list 'user 'set-profile
	   uuid name fullname email photo (time))))

  (defmethod (set-user-role uuid role)
    (if (not (eq? creator current-space))
        (error "Not space owner"))
    (add-sexp-blob (list 'user 'set-role uuid role (time))
		   "host"))

  (defmethod (set-friend uuid)
    (set-user-role uuid 1)
    (send-profile uuid)
    true)

  (defmethod (add-chat rcpt target content)
    (if (eq? rcpt "") (set! rcpt ()))
    (if (eq? target "") (set! target ()))

    (if (and (not (null? rcpt)) (not (eq? current-user current-space)))
	(error "Only space owner can have private chat"))
    
    (define now (time))
    (define action 'add)
    (cond
     [(eq? content "/read")
      ;; Already read, do nothing
      (if (is-chat-read? target)
	  (return true))
      (if (null? rcpt)
	  (set! rcpt current-user))
      ])
    
    (define hash (add-sexp-blob (list 'chat action
				   current-user rcpt now
				   target content) rcpt))
    (if (not (string? hash))
	(return (list :error "Failed")))

    ;; Post this message if this is a private chat
    (if (and (not (null? rcpt))
	     (not (eq? rcpt current-user)))
	(begin
	  (send-profile rcpt) ;; Try to update our profile
	  (add-to-post-queue rcpt (get-blob-id hash) now)))
	     
    (list :hash hash :ctime now))

  ;; If our profile is sent to the same user before and not updated,
  ;; then it won't be actually sent
  (defmethod (send-profile rcpt)
    (let [(x (find-profile current-user))]
      (if (not (null? x))
	  (add-to-post-queue rcpt (get-blob-id x:hash) x:mtime))))

  (defmethod (count-unread-chats)
    (define x (db 'first "SELECT COUNT(*) AS cnt FROM chat c
LEFT JOIN chatlog l ON c.lastlog = l.id
WHERE c.lastread < l.ctime AND c.uid > 0"))
    x:cnt)

  (defmethod (find-latest-chat rcpt)
    (define x (db 'first "
SELECT 
  c.id AS id,
  c.hash AS hash,
  u.uuid AS rcpt,
  c.ctime AS ctime,
  c.lastread AS lastread,
  c.title AS title,
  l.content AS content,
  l.ctime AS lastactive
FROM chat c 
LEFT JOIN chatlog l ON c.lastlog = l.id
LEFT JOIN user u ON c.uid = u.id
WHERE u.uuid=?
ORDER BY l.ctime DESC
LIMIT 1" rcpt))
    x)

  (defmethod (list-chats offset limit)
    (define x (db 'first "SELECT COUNT(*) AS cnt FROM chat"))
    (define y (db 'query "
SELECT 
  c.id AS id,
  c.hash AS hash,
  u.uuid AS rcpt,
  u.photo AS photo,
  u.name AS name,
  c.ctime AS ctime,
  c.lastread AS lastread,
  c.title AS title,
  l.content AS content,
  l.ctime AS lastactive,
  v.uuid AS lastfrom
FROM chat c 
LEFT JOIN chatlog l ON c.lastlog = l.id
LEFT JOIN user u ON c.uid = u.id
LEFT JOIN user v ON l.uid = v.id
WHERE c.uid > 0
ORDER BY l.ctime DESC
LIMIT \{limit}
OFFSET \{offset}"))
    
    (list x:cnt y))

  (define (get-chat-id hash)
    (define x (db 'first "SELECT id FROM chat WHERE hash=?" hash))
    (if (null? x) false x:id))

  (defmethod (get-latest-profile-log-ctime)
    (define x (db 'first "SELECT IFNULL(MAX(ctime),0) AS ctime FROM profilelog"))
    x:ctime)
  
  (defmethod (get-latest-chat-log-id)
    (define x (db 'first "SELECT IFNULL(MAX(id),0) AS maxid FROM chatlog"))
    x:maxid)

  (defmethod (get-latest-note-log-id)
    (define x (db 'first "SELECT IFNULL(MAX(id),0) AS maxid FROM notelog"))
    x:maxid)

  (defmethod (list-chat-messages hash pos limit forward)
    (define id (get-chat-id hash))
    (if (< pos 0)
        (set! pos 1000000000))
    (if (<= limit 0)
        (error "Bad limit" limit))
    (define c (if forward ">" "<"))
    (define order (if forward "ASC" "DESC"))

    (define cnt (get (db 'first "SELECT COUNT(*) AS cnt FROM chatlog WHERE chatid=? AND id\{c}?"
                         id pos) 'cnt))
    (define u (db 'query "
SELECT 
l.id AS id,
l.hash AS hash,
u.uuid AS uuid,
u.photo AS photo,
l.action AS action,
l.target AS target,
l.content AS content,
l.ctime AS ctime
FROM chatlog l
LEFT JOIN user u ON l.uid = u.id
WHERE chatid=? AND l.id\{c}?
ORDER BY l.id \{order}
LIMIT \{limit}
" id pos))

    (list cnt u))


  (defmethod (list-files hash offset limit)
    (define id (get-file-id hash))
    (define x (db 'first "SELECT COUNT(*) AS cnt FROM file
WHERE dirid=?" id))
    (define y (db 'query "
SELECT 
f.id AS id,
f.hash AS hash,
f.isdir AS isdir,
f.name AS name,
pb.type AS type,
pb.size AS size,
pb.hash AS blobhash
FROM file f
LEFT JOIN pblob pb ON f.blobid=pb.id
WHERE f.dirid=? AND f.status > 0
ORDER BY f.name, f.hash
LIMIT \{limit}
OFFSET \{offset}" id))
    (list x:cnt y))

  (defmethod (add-file dirhash name blobhash)
    (define hash (add-sexp-blob (list 'file 'add
				      dirhash
				      name
				      blobhash
				      (time))))
    hash
    )

  (defmethod (rename-file dirhash name)
    (define hash (add-sexp-blob (list 'file 'rename
				      dirhash
				      name
				      (time))))
    hash
    )

  (defmethod (update-file file-hash blob-hash)
    (define hash (add-sexp-blob (list 'file 'update
				      file-hash
				      blob-hash
				      (time))))
    hash
    )
  
  (defmethod (remove-file dirhash)
    (define hash (add-sexp-blob (list 'file 'remove
				      dirhash
				      (time))))
    hash
    )

  (defmethod (move-file filehash dirhash)
    (define hash (add-sexp-blob (list 'file 'moveto
				      dirhash
				      filehash
				      (time))))
    hash
    )
  
  (defmethod (add-folder dirhash name)
    (define hash (add-sexp-blob (list 'file 'mkdir
				      dirhash
				      name
				      (time))))
    hash
    )

  (defmethod (set-favorite type target fav)
    ;; fav 0: Unfavorite
    ;; fav 1: Public favorite, visible to members
    ;; fav 2: Private favorite
    (define u (db 'first "SELECT hash FROM userfav LEFT JOIN user ON userfav.uid = user.id
 WHERE user.uuid=? AND userfav.type=? AND userfav.target=? AND userfav.fav=?"
		  current-user type target fav))
    (if (not (null? u))
	(return u:hash))
    
    (define ts (time))
    (define x (list 'user 'set-fav current-user type target fav ts))
    (define hash (add-sexp-blob x (if (eq? fav 2) current-user false)))
    hash
    )

  
  (defmethod (set-chat-read hash)
    (db 'query "UPDATE chat SET lastread=? WHERE hash=?" (time) hash))

  (defmethod (is-chat-read? hash)
    (define x (db 'first "SELECT c.hash AS hash, c.lastread AS lastread, l.ctime AS lastactive
FROM chat c LEFT JOIN chatlog l ON c.lastlog = l.id WHERE c.hash = ?" hash))
    (println "is-chat-read: " x)
    (if (null? x)
	false
	(>= x:lastread x:lastactive)))

  (defmethod (list-ledger-accounts lg-id &optional parent)
    (if (not parent)
        (db 'query "SELECT * FROM ledger_account WHERE status=1 AND ledger_id=? AND parent_id=0" lg-id)
        (db 'query "SELECT * FROM ledger_account WHERE status=1 AND parent_id=?" (get-ledger-account-id parent))))

  (defmethod (add-ledger-account lg-hash name type &optional parent)
    (add-sexp-blob (list 'ledger current-user (time) lg-hash
                         'add-account name type
                         (or parent ()))))

  (defmethod (edit-ledger-account ahash name parent-id icon description)
    (define x (db 'first "
SELECT l.hash AS lhash
FROM ledger_account a 
LEFT JOIN ledger l ON l.id=a.ledger_id
WHERE a.hash=?" ahash))

    (define parent ())
    (define y (db 'first "SELECT hash FROM ledger_account WHERE id=?" parent-id))
    (if (not (null? y))
        (set! parent y:hash))

    (add-sexp-blob (list 'ledger current-user (time) x:lhash
                         'edit-account ahash name parent icon description)))

  (defmethod (list-ledger-units lg-id &optional parent)
    (if (not parent)
        (db 'query "SELECT * FROM ledger_unit WHERE status=1 AND ledger_id=? AND parent_id=0" lg-id)
        (db 'query "SELECT * FROM ledger_unit WHERE status=1 AND parent_id=?" (get-ledger-unit-id parent))))

  (defmethod (add-ledger-unit lg-hash code name type &optional parent)
    (if (eq? type 2)
        (set! code ()))
    (add-sexp-blob (list 'ledger current-user (time) lg-hash
                         'add-unit code name type
                         (or parent ()))))
  
  
  (defmethod (list-ledgers)
    (db 'query "SELECT * FROM ledger WHERE status=1"))

  (defmethod (add-ledger name currency)
    (add-sexp-blob (list 'ledger current-user (time) () 'add name currency)))

  (defmethod (add-ledger-transaction lghash comment prev type &rest details)
    (add-sexp-blob (list 'ledger current-user (time) lghash
                         'add-transaction comment prev type details)))
  
  (defmethod (cancel-ledger-transaction comment prev)
    (define x (db 'first "SELECT l.hash AS lghash
FROM ledger_transaction t 
LEFT JOIN ledger l ON l.id = t.ledger_id 
WHERE t.hash=?" prev))
    (add-sexp-blob (list 'ledger current-user (time) x:lghash
                         'cancel-transaction comment prev)))

  (defmethod (list-ledger-transactions lg-id pos limit)
    (if (< pos 0) (set! pos 100000000))

    (define x (db 'first "
SELECT COUNT(*) AS cnt FROM ledger_transaction
WHERE id < ? AND ledger_id=?" pos lg-id))

    (list x:cnt
          (db 'query "
SELECT
  t.id AS id,
  t.hash AS hash,
  t.total AS total,
  t.comment AS comment,
  t.ctime AS ctime,
  t.status AS status,
  u.name AS creator,
  u.uuid AS uuid,
  u.photo AS photo
FROM ledger_transaction t 
LEFT JOIN user u ON t.creator = u.id
WHERE t.ledger_id=? AND t.id < ?
ORDER BY t.id DESC
LIMIT \{limit}
" lg-id pos)))

  (defmethod (find-ledger-transaction x)
    (db 'first "SELECT 
  t.id AS id,
  t.hash AS hash,
  t.total AS total,
  t.comment AS comment,
  t.ctime AS ctime,
  t.status AS status,
  o.hash AS origin_hash,
  p.hash AS next_hash,
  u.name AS creator,
  l.id AS ledger_id,
  l.hash AS ledger_hash,
  l.name AS ledger_name,
  l.currency AS ledger_currency,
  u.uuid AS uuid,
  u.photo AS photo
FROM ledger_transaction t
LEFT JOIN ledger l ON t.ledger_id=l.id
LEFT JOIN user u ON t.creator = u.id
LEFT JOIN ledger_transaction o ON t.origin_txid = o.id
LEFT JOIN ledger_transaction p ON p.origin_txid = t.id
WHERE t.hash like ?"
        (concat x "%")))

  (defmethod (get-transaction-detail txid)
    (db 'query "
SELECT 
 d.unit_code AS unit_code,
 d.quantity AS quantity,
 d.price AS price,
 d.txdate AS txdate,
 d.account_id AS account_id,
 a.name AS account_name,
 a.hash AS account_hash
FROM ledger_transaction_detail d
LEFT JOIN ledger_account a ON a.id = d.account_id
WHERE d.txid = ?
ORDER BY d.txdate ASC
"
        txid)
    )

  (define (list-account-tree id)
    (get (db 'first "with RECURSIVE a(x) AS (
  VALUES (?) UNION ALL 
  SELECT ledger_account.id FROM ledger_account, a WHERE ledger_account.parent_id = a.x
) select group_concat(x) as ids from a" id) 'ids))

  (defmethod (list-account-stat id unit &rest u)
    (define tree (concat "(" (list-account-tree id) ")"))
    (let loop [(u u) (r ())]
      (if (or (null? u) (null? (cdr u)))
          (return (reverse r)))
      (define start (car u))
      (define end (cadr u))
      (define x
        (if (not unit)
            (db 'first "
select sum(quantity*price) as val from ledger_transaction_detail d
left join ledger_transaction t ON d.txid=t.id
where d.account_id in \{tree} and t.status=1 and d.txdate >=? AND d.txdate < ?" start end)
            (db 'first "
select sum(quantity) as qty, sum(quantity*price) as val 
from ledger_transaction_detail  d
left join ledger_transaction t ON t.id = d.txid
where d.account_id in \{tree} and t.status = 1 and d.unit_code = ? and d.txdate >=? AND d.txdate < ?" unit start end)))

      (loop (cdr u) (cons x r))
      )    
    )

  (defmethod (get-account-info id)

    (define tree (concat "(" (list-account-tree id) ")"))
    
    ;; Return  (<account> <balance> <units> <parents>)
    (list
     (db 'find "ledger_account" :id id)
     (get (db 'first "
select sum(quantity*price) as balance from ledger_transaction_detail d
left join ledger_transaction t ON d.txid=t.id
where d.account_id in \{tree} and t.status=1") 'balance)
     (db 'query "
select unit_code,sum(quantity) as quantity, sum(quantity*price) as subbalance 
from ledger_transaction_detail  d
left join ledger_transaction t ON t.id = d.txid
where d.account_id in \{tree} and t.status = 1
group by unit_code;
")
     (db 'query "
with RECURSIVE a(id) AS (
  VALUES (?) UNION ALL 
  SELECT y.parent_id  FROM a LEFT JOIN ledger_account y 
  ON a.id=y.id WHERE y.parent_id IS NOT NULL AND y.parent_id > 0
)
select 
y.id AS id,
y.hash AS hash,
y.name AS name,
y.type AS type
 from a LEFT JOIN ledger_account y ON a.id=y.id WHERE a.id <> ? ORDER BY a.id ASC;
" id id)
     ))

  (defmethod (list-account-transactions id start end)
    (db 'query "
SELECT
 d.unit_code AS unit_code,
 d.quantity AS quantity,
 d.price AS price,
 d.txdate AS txdate,
 t.id AS txid,
 t.hash AS txhash,
 t.comment AS comment,
 u.uuid AS creator,
 t.status AS status,
 u.photo AS photo
FROM ledger_transaction_detail d
LEFT JOIN ledger_transaction t ON t.id = d.txid
LEFT JOIN user u ON t.creator = u.id
WHERE d.account_id=? AND d.txdate >= ? AND d.txdate <= ?
ORDER BY d.txdate DESC,d.id DESC
" id start end)
    )


  (defmethod (stat)
    (list
     ;; 0 - Real file size
     (+
      (or (filesize "\{path}-wal") 0)
      (or (filesize "\{path}-shm") 0)
      (or (filesize path) 0))

    ;; 1 - Blobs Info
    (db 'first "select IFNULL(SUM(size),0) as blobsize, COUNT(*) as blobcnt FROM pblob")

    ;; 2 - Users Info
    (db 'first "select COUNT(*) as usercnt FROM user")

    ;; 3 - Temporary blobsize
    (db 'first "select IFNULL(SUM(size),0) as tempblobsize, COUNT(*) as tempblobcnt FROM pblob WHERE xref=0")
     ))

  (defmethod (remove-unref-blobs)
    (db 'query "DELETE FROM pblob WHERE xref=0")
    )

  (defmethod (list-blobs-stat &rest u)
    ;; u -- (ts0 ts1 ... tsN)
    ;; Returns list of the stat info 
    ;; 0 - ts0 <= x < ts1
    ;; 1 - ts1 <= x < ts2
    ;; and so on.
    (let loop [(u u) (r ())]
      (if (null? u)
          (return (reverse r)))
      (define start (car u))
      (define end (if (null? (cdr u)) (time) (cadr u)))
      (define x (db 'first "
SELECT 
 IFNULL(SUM(p.size),0) as blobsize,
 COUNT(*) AS blobcnt FROM xblob x LEFT JOIN pblob p ON x.pbid=p.id
WHERE x.ctime >= ? AND x.ctime < ?" start end))
      (loop (cdr u) (cons x r))
      )
    )
  )

;;----------------------------------------------------------------------
;; (space-storage-create)
;;
;; Do three things,
;; 
;; Create space owner using the keypair
;; which is also
;; If keypair UUID dervied from keypair is not equal to UUID,
;; then we are not the owner.
;; user-info
;; - pk
;; - vk
;; - name
;; - email
;;
;; The shared secret can be used to provide access checking on server.
;; access code is derived from shared-secret. but the server has no way
;; to know about the shared-secret.
;;----------------------------------------------------------------------

(define space-storage-directory "\{*var-path*}/data/space")


(define (space-storage-get-blob-directory space-id blob-hash)
  ;; Convert a blob hash x to file system path in the form of
  ;;   .../space/<sssss>/<xx>/<xxyyyyyyyyyy...>
  
  "\{space-storage-directory}/\{space-id}/\{(slice blob-hash 0 2)}"
  )

(define (space-storage-create uuid pk user-info db-key &key shared-secret space-name)
  ;; user-info: the creator, could be someone else than owner
  ;;  - pk
  ;;  - vk

  (if (not (eq? uuid (pubkey->address pk)))
      (error "Space id and pk mismatch"))

  (define instance-id (hex-encode (random-bytes 8)))

  ;; How to recreate?
  (if (space-storage-exists? instance-id)
      (error "Already exists"))
  
  (mkdir space-storage-directory)
  (define db-path (space-storage-get-path instance-id))
  (define db (open-sqlite3-database db-path))

  (define user-uuid (pubkey->address user-info:pk))
  (define now (time))
  (define name)
  (if (assoc 'name user-info)
      (set! name user-info:name))

  (if (> (length db-key) 0)
      (db 'exec "PRAGMA key=\"x'\{(hex-encode db-key)}'\""))

  (db 'exec space-storage-init-script)

  (db 'insert "config" :name 'version       :value 1)
  (db 'insert "config" :name 'space-id      :value uuid)
  (db 'insert "config" :name 'instance-id   :value instance-id)
  (db 'insert "config" :name 'creator       :value user-uuid)
  (db 'insert "config" :name 'create-time   :value now)

  (if shared-secret
      (db 'insert "config" :name 'shared-secret :value shared-secret))

  (db 'insert "user"
      :uuid user-uuid
      :name name
      :pk (hex-encode user-info:pk)
      :vk (hex-encode user-info:vk)
      :mtime 0
      :ctime now)

  (if (and (eq? user-uuid uuid) (not shared-secret))
      (error "Shared secret required")
      )

  (if (not (eq? user-uuid uuid))
      (db 'insert "user" :uuid uuid :pk (hex-encode pk) :name (or space-name (substring uuid 0 6)) :mtime now :ctime now))

  (db 'finalize)
  instance-id)

(define (space-storage-get-creator-keypair db-name)
  (define db-path (space-storage-get-path db-name))
  (define db (open-sqlite3-database db-path))
  (define creator (db 'find "config" :name 'creator))
  (define x (db 'find "user" :uuid creator:value :select "pk,vk"))
  (define kp (cons (hex-decode x:vk) (hex-decode x:pk)))
  (db 'finalize)
  kp)

(define (space-storage-get-path dbname)
  "\{space-storage-directory}/\{dbname}.db")

(define (space-storage-remove dbname)
  (unlink "\{space-storage-directory}/\{dbname}.db-wal")
  (unlink "\{space-storage-directory}/\{dbname}.db-shm")
  (unlink "\{space-storage-directory}/\{dbname}.db"))

(define (space-storage-get-size dbname)
  (+
   (or (filesize "\{space-storage-directory}/\{dbname}.db-wal") 0)
   (or (filesize "\{space-storage-directory}/\{dbname}.db-shm") 0)
   (or (filesize "\{space-storage-directory}/\{dbname}.db") 0)))

(define (space-storage-exists? dbname)
  (file-exists? (space-storage-get-path dbname)))

;;----------------------------------------------------------------------
;; Space DB Initialization SQL 
;;----------------------------------------------------------------------

(define space-storage-init-script "

------------------------------------------------------------------------
-- So that we can read without blocking writes
-- especially important when dealing with big blobs
------------------------------------------------------------------------
PRAGMA journal_mode=WAL;

------------------------------------------------------------------------
-- TABLE config
-- This is like registry, only resides in the main space db
-- it stores personal configurations.
-- For configuration at the same path, it is always the latest one wins.
-- and the previous blob id should be marked as obsolete and
-- can be removed at the next blob gc
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  value TEXT
);

------------------------------------------------------------------------
-- TABLE user
-- Two types of user
-- 1. Our profiles. keypair
-- 2. Invited members. no private key
-- The first note added by user without any previous connection
-- is the root note of this user's information tree.
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  pk TEXT, -- Could be NULL if it's automatically added by touch-user
  vk TEXT, -- NULL unless this user is owned by us
  fullname TEXT, -- Displayed in profile
  name TEXT, -- Shorter, personal, display in chat/notes
  email TEXT, -- contact info.
  photo TEXT, -- blob hash url

  role INTEGER DEFAULT 0,
   -- Ignore this field if uuid equals to space id
   -- 0: blocked
   -- 1: friend, can send notes to us
   -- 2: member, collaborator, can r/w space notes
   -- 3: someone who you sent a friend request to
   -- 4: someone who sent you a friend request
  mtime INTEGER, -- profile update time
  ctime INTEGER
);

-- Track profile modifications.
-- Only the latest version is kept.
-- blobs of previous version should be deleted when new version
-- is added. 
CREATE TABLE IF NOT EXISTS profilelog (
  uid INTEGER NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  ctime INTEGER -- when this record is added
);

CREATE INDEX IF NOT EXISTS idx_profilelog_uid ON profilelog(uid);

-- Track role modifications.
-- Only the latest is kept.
-- If previous versions are kept, it could cause
-- host to grant unwanted access when syncing
-- to a new host.
CREATE TABLE IF NOT EXISTS rolelog (
  uid INTEGER NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  ctime INTEGER
);

-- User's host information
-- Auto updated at run time.
CREATE TABLE IF NOT EXISTS host (
  id INTEGER PRIMARY KEY,
  uid INTEGER UNIQUE NOT NULL, -- user id
  type TEXT, 
   -- 'hub': auto update from twinkle hub
   -- 'manual': manual updated, self hosted
  uuid TEXT, -- uuid of the host associated with user
  ip TEXT,  
  port INTEGER,
  contract TEXT,
  retry INTEGER, -- retry only when NOW>retry if NOT NULL
  retrycnt INTEGER DEFAULT 0, -- For calculating retry time with decreased frequency
  mtime INTEGER, -- host info update time
  ctime INTEGER);

------------------------------------------------------------------------
-- TABLE note
-- Contains the latest information 
-- TODO: merge info. If there is multiple edits,
--    we may need to merge. or may not need
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS note (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE, -- the original hash
  uid INTEGER,    -- the latest author
  revid INTEGER,  -- the latest edit log entry
  mtime INTEGER,  -- unix time, last time change
  exid INTEGER DEFAULT 0,   -- the note extended by this, time is same as ctime
  brid INTEGER DEFAULT 0,   -- the note under which this locates, happen at ctime
  annid INTEGER DEFAULT 0,  -- the note being annotated by this one, happen at ctime
  ctime INTEGER,  -- when the note is created by its author
  status INTEGER  -- 0-N/A,1=OK,2=RESERVED,3=DELETED. 
);

CREATE VIRTUAL TABLE IF NOT EXISTS notetext USING fts5(subject, content, 
 tokenize=\"unicode61 tokenchars '@#'\");
 
------------------------------------------------------------------------
-- TABLE notelog
-- Append Only
-- The note table and other can be rebuilt by
-- scanning this table.
-- content is artificially limited to 2000 bytes, about a screen 
-- of 80x25 terminal
--  If there is too much content it's not good for reading
-- <prev-hash> is useful for make sure prior messages from uid is received.
-- and that if the <prev-hash> is already used by a 
-- for a total ordering of events.
-- ctime is insufficient because many things can happen in one second
-- (note <uuid> <ctime> <action> <target> <origin> <content>)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notelog (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE, -- hash = sha256 hash of the entire log message
  noteid INTEGER,       -- Point to the note 
  uid INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  origin TEXT,
  ctime INTEGER, -- when the action happened.
  content TEXT
);

CREATE TABLE IF NOT EXISTS noteref (
  rev INTEGER,
  refid INTEGER
);

------------------------------------------------------------------------
-- TABLE chat
-- (chat <uuid> <ctime> <action> <target> <content>)
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE, 
    -- chat unique id, first message hash
  uid INTEGER, 
    -- 0: Visible to all members
    -- others: visible to specified user
  title TEXT,
  lastlog INTEGER,
  lastread INTEGER,
  ctime INTEGER
);

CREATE TABLE IF NOT EXISTS chatlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  uid INTEGER,
  chatid INTEGER,
  action TEXT,
  target TEXT, 
  content TEXT,
  ctime INTEGER
);


------------------------------------------------------------------------
-- xblob: eXchangable BLOBs
-- 
-- This is a syncable blob stream.
-- Everything in a space is presentable by one or more blobs.
-- Two space instances can exchange their blobs and become synchronized.
-- Exchange can happen between two peer instances, or between one peer instance and a host instance.
CREATE TABLE IF NOT EXISTS xblob (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- can be remembered by peer as synchronization position 
  xhash TEXT NOT NULL UNIQUE, -- Hash(Encrypted(plain blob data, other info))
    -- one plain blob data can have different xhashes, because their meta data such as
    -- creation time can be used for encryption iv. therefore have different encrypted values
    -- useful for deletion or other purposes
    -- two xblobs refering to the same underlying plain blob will have only one real copy of data
  pbid INTEGER NOT NULL,
    -- >0: plain blob id 
    --  0: deleted
    -- -1: deleted & synced to host (only owner can sync deletion)
  creator TEXT NOT NULL,
    -- uuid of the creator/sender
  receiver TEXT,
    -- uuid of the receiver of this blob, blob is encrypted with shared secret between the two
    -- NULL: blob is visible to all members, encrypt it with shared secret of space on sync
    -- String 'host': content is visible to host only
  status INTEGER DEFAULT 0,
    -- 0: waiting for processing
    -- 1: valid
    -- 2: invalid
  inst INTEGER DEFAULT 0,
    -- Which instance this is from. for syncing optimization.
  ctime INTEGER NOT NULL
    -- original blob creation time, used in encryption, will be exchanged
);

CREATE INDEX IF NOT EXISTS idx_xblob_status ON xblob(status);
CREATE INDEX IF NOT EXISTS idx_xblob_pbid ON xblob(pbid);

-- Tracking sync progress
-- Remember last synced position of remote instance
CREATE TABLE IF NOT EXISTS blobsync (
   id INTEGER PRIMARY KEY,
   uuid TEXT, -- host id or peer id
   instance TEXT, -- a host or peer many have many instances of the same space
   pos INTEGER DEFAULT 0,
   mtime INTEGER,
   ctime INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blobsync ON blobsync(uuid,instance);

CREATE TABLE IF NOT EXISTS pblob (
  id INTEGER PRIMARY KEY,
  hash TEXT, 
    -- sha256 of the content
  type TEXT, 
    -- ordinary MIME types, one special value is:
    -- text/x-twk: processable
  size INTEGER NOT NULL,
    -- byte count of blob data
  xref INTEGER DEFAULT 0,
    -- 0: blob is freshly uploaded
    -- 1: This blob is referenced by an xblob
  ctime INTEGER NOT NULL, 
    -- when this entry is created
  content BLOB
    -- Store it as last field to avoid performance problems
    -- Don't shoot yourself with 'SELECT *'
);

CREATE INDEX IF NOT EXISTS idx_pblob_type ON pblob(hash);
CREATE INDEX IF NOT EXISTS idx_pblob_type ON pblob(type);

CREATE TABLE IF NOT EXISTS blobpost (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  xhash TEXT NOT NULL UNIQUE,
  pbid INTEGER,
  rcpt TEXT NOT NULL,
  sent INTEGER DEFAULT 0, -- sent time
  ctime INTEGER);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blobpost_rcpt_pbid ON blobpost(rcpt,pbid);

CREATE TABLE IF NOT EXISTS blobref (
  blobid INTEGER,
  refid INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blobref ON blobref(blobid,refid);

")


(define space-storage-init-list
  (list
   (cons 1 space-storage-init-script)
   (cons 2 "
CREATE TABLE IF NOT EXISTS file (
  id INTEGER PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  isdir INTEGER NOT NULL DEFAULT 0,
  dirid INTEGER NOT NULL DEFAULT 0,
  blobid INTEGER,  
  status INTEGER NOT NULL DEFAULT 1,
  mtime INTEGER,
  ctime INTEGER
);
CREATE INDEX IF NOT EXISTS idx_file_dirid ON file(dirid);

CREATE TABLE IF NOT EXISTS filelog (
	id	INTEGER PRIMARY KEY AUTOINCREMENT,
	fileid	INTEGER,
	uid	INTEGER NOT NULL,
	hash	TEXT NOT NULL UNIQUE,
	action	TEXT,
	target	TEXT,
	ctime	INTEGER
);
CREATE INDEX IF NOT EXISTS idx_filelog_fileid ON filelog(fileid);
CREATE INDEX IF NOT EXISTS idx_filelog_action ON filelog(action);
CREATE INDEX IF NOT EXISTS idx_filelog_ctime ON filelog(ctime);

CREATE TABLE IF NOT EXISTS userfav (
	id	INTEGER PRIMARY KEY,
	hash	TEXT NOT NULL UNIQUE,
	uid	INTEGER NOT NULL,
	type	TEXT NOT NULL,
	target	TEXT NOT NULL,
	fav	INTEGER NOT NULL DEFAULT 0,
	mtime	INTEGER NOT NULL,
	ctime	INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_userfav ON userfav(uid,type,target);

")
   (cons 3 "
CREATE TABLE IF NOT EXISTS ledger_unit_log (
	id	INTEGER,
        hash TEXT UNIQUE,
	unit_id	INTEGER,
	parent_id	INTEGER,
	name	TEXT,
	description	TEXT,
	icon	TEXT,
	creator	INTEGER,
	ctime	INTEGER,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_transaction (
	id	INTEGER,
	hash	TEXT UNIQUE,
	ledger_id	INTEGER,
	origin_txid	INTEGER DEFAULT 0,
	type	INTEGER DEFAULT 1,
	total	REAL,
	comment	TEXT,
	status	INTEGER DEFAULT 1,
	creator	INTEGER,
	ctime	INTEGER,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_transaction_detail (
	id	INTEGER,
	txid	INTEGER,
	account_id	INTEGER,
	unit_code	TEXT,
	quantity	REAL,
	price	REAL,
	txdate	TEXT,
	comment	TEXT,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_unit (
	id	INTEGER,
	hash	TEXT UNIQUE,
	code	TEXT,
	ledger_id	INTEGER,
        type    INTEGER, -- 1: normal, 2: directory
	name	TEXT,
	description	TEXT,
	icon	TEXT,
	creator	INTEGER,
	ctime	INTEGER,
        status INTEGER DEFAULT 1,
	parent_id	INTEGER DEFAULT 0,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_account_log (
	id	INTEGER,
	account_id	INTEGER,
	hash	TEXT UNIQUE,
	name	INTEGER,
	parent_id	INTEGER,
	icon	TEXT,
	description	TEXT,
	ctime	INTEGER,
	creator	INTEGER,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_account (
	id	INTEGER,
	ledger_id  INTEGER,
	hash	TEXT UNIQUE,
	name	TEXT,
	parent_id   INTEGER DEFAULT 0,
	icon	INTEGER,
	description  TEXT,
        type INTEGER, -- 1: normal, 2: directory
	status	INTEGER DEFAULT 1,
	ctime	INTEGER,
	creator	INTEGER,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger_log (
	id	INTEGER,
	hash	TEXT UNIQUE,
	ledger_id   INTEGER,
	name	TEXT,
	icon	TEXT,
	creator	INTEGER,
	ctime	INTEGER,
	PRIMARY KEY(id)
);
CREATE TABLE IF NOT EXISTS ledger (
	id	INTEGER,
	hash	TEXT UNIQUE,
	name	TEXT NOT NULL,
	icon	TEXT,
	currency  TEXT NOT NULL, -- Can not be changed
        status  INTEGER DEFAULT 1, -- 0: deleted. 1: active
	creator	INTEGER,
	ctime	INTEGER,
	PRIMARY KEY(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_account 
  ON ledger_account(ledger_id);

CREATE INDEX IF NOT EXISTS idx_ledger_transaction 
  ON ledger_transaction(ledger_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_ctime 
  ON ledger_transaction(ctime);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_unit_code
  ON ledger_unit(ledger_id, code);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_detail 
  ON ledger_transaction_detail(txid);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_detail_a 
  ON ledger_transaction_detail(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_detail_t 
  ON ledger_transaction_detail(txdate);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_detail_u 
  ON ledger_transaction_detail(unit_code);

")
   ))
