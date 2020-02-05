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

package app.twinkle.notes;

/*
 * Interface to native Twinkle Core
 */
public class TwinkleSystem {

    public TwinkleSystem() {
        try {
            System.loadLibrary("twk");
            System.out.println("TWK Loaded");
        } catch (UnsatisfiedLinkError e) {
            System.out.println("load twk failed:" + e.getMessage());
            throw e;
        }
    }

    public void start() {
        JNIStart();
    }

    public String getMessage() {
        return JNIGetMessage();
    }

    public void setDistPath(String path) {
        JNISetDistPath(path);
    }

    public void setVarPath(String path) {
        JNISetVarPath(path);
    }

    public void startLogger() { JNIStartLogger(); }
    private native void JNIStart();
    private native void JNIStartLogger();
    private native String JNIGetMessage();
    private native int JNISetDistPath(String path);
    private native int JNISetVarPath(String path);
}
