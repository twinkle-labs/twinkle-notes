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

;; -*- mode: Scheme; -*-

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; CONTROL -- Manage Processes
;;
;; Control app server and space processes.
;; Space processes are created from here.
;; It will watch for spaces, and update the space-list
;; periodically.
;;
;; Actually, it can be used to traverse all processes
;; in the system. Since it's the one after init.
;;
;; Possible Options
;;  --port <port>  http app server port
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(define last-good-port false)
(random-seed (time))
(define (random-port)
	(floor (+ 2000 (* (random) 10000))))

(define httpd-port 
  (if (assoc 'port args)
	args:port
	6780))
	
(define space-list ())

;; pid: client mux process id
(define (do-join-space pid space-uuid dbname dbkey ack)
  (let [(pid (open-space dbname dbkey))]
      (if (< pid 0)
	  (ack ())
	  (send-request pid (list 'get-space-info)
			^{[x](println "space info:" x)(ack (cons pid x))}))))


(defmethod (did-space-exit pid)
  (set! space-list (remove ^{[x] (eq? (car x) pid)} space-list)))

(define (open-space name passphrase)
  (if (not (space-storage-exists? name))
      (return -1))
  (let loop [(u space-list)]
    (cond
     [(null? u)
      (let [(pid (start "space" name passphrase))]
	(set! space-list (cons (cons pid name) space-list))
	pid)]
     [(eq? name (cdar u))
      (caar u)]
     [else
      (loop (cdr u))])))

(defmethod (list-spaces)
  (println "list-spaces")
  space-list)
  
(defmethod (timeout)
  (if (not (process-exists? httpd-pid))
	(begin
      (println "Restarting http server")
	  (if (not last-good-port)
		(set! httpd-port (random-port)))
      (set! httpd-pid (spawn start-http-server (list "127.0.0.1" httpd-port)))
	  (set-timeout 2))
	(begin
	   (set! last-good-port httpd-port)
	   (set-timeout 5))))


(defmethod (on-request msg ack)
  (match msg
         [(join-space pid space-uuid dbname dbkey)
          (do-join-space pid space-uuid dbname dbkey ack)]
         [else
          (if (method? (car msg) self)
              (ack (apply self msg)))]))


(global-session-db 'exec "
CREATE TABLE IF NOT EXISTS token (
id TEXT PRIMARY KEY,
space TEXT,
dbname TEXT,
dbkey TEXT,
ctime INTEGER)")

(define httpd-pid (spawn start-http-server (list "127.0.0.1" httpd-port)))
(println "Starting HTTPD #\{httpd-pid} at port " httpd-port)
(set-timeout 2)
