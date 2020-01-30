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

(load "lib/space-list.l")
(load "lib/space-storage.l")

(define global-session-db (open-sqlite3-database ":memory:"))
(define registry-host "hub.twinkle.app")
(define registry-uuid "18o1qkHtUDAnC9z7v5SBzYZGNDsrrbKyry")
(define registry-port 6767)

(if (file-exists? "./config.l")
    (load "config.l"))

