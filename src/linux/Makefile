BUILD_DIR=./build
TWK_DIR=../../../twinkle-lisp
CEF_DIR=./lib/cef_binary_linux64
TARGET=$(BUILD_DIR)/twinkle

#---------------------------------------------------------------------

CXXFLAGS+=-g `pkg-config --cflags --libs gtk+-2.0`
CXXFLAGS+=-I../share/ceftwinkle -I$(CEF_DIR) -I$(TWK_DIR)/src/public
LFLAGS+=-g `pkg-config --libs gtk+-2.0`
LFLAGS+=-L $(CEF_DIR)/Release -lcef_dll_wrapper -lcef -lX11 -Wl,-R. -Wl,-R/usr/lib  -L $(TWK_DIR) -ltwk -ldl -lpthread -lm -lz -lcrypto

# Enable the executable to load shared libraries origin from where it is
# CEF seems to have problem when we use a special lib folder
# Use `readelf -d twinkle` to examine 
LFLAGS+=-Wl,-rpath,'$$ORIGIN'

#---------------------------------------------------------------------

SRCS=\
	./ceftwinkle_linux.cc \
	./twinkle_handler_linux.cc \
	../share/ceftwinkle/twinkle_app.cc \
	../share/ceftwinkle/twinkle_handler.cc 

OBJS=$(SRCS:%.cc=%.o)

#---------------------------------------------------------------------

$(TARGET): $(OBJS) dist
	g++ $(OBJS) -o $(TARGET) $(LFLAGS)

%.o: %.cc
	g++ $(CXXFLAGS) -o $@ -c $<

dist:
	@mkdir -p $(BUILD_DIR)
	@rsync -av $(CEF_DIR)/Release/* $(BUILD_DIR)
	@rsync -av $(CEF_DIR)/Resources/* $(BUILD_DIR)
	@ln -sf ../../../../twinkle-lisp/lisp $(BUILD_DIR)
	@ln -sf ../../../site-lisp $(BUILD_DIR)
	@ln -sf ../../../web $(BUILD_DIR)
deb: 
	@echo It may take several minutes...
	mkdir -p debian/opt/app.twinkle.notes
	mkdir -p debian/usr/share/applications
	cp app.twinkle.notes.desktop debian/usr/share/applications
	cp -RL $(BUILD_DIR)/* debian/opt/app.twinkle.notes
	strip debian/opt/app.twinkle.notes/libcef.so
	cp appicon.png debian/opt/app.twinkle.notes/appicon.png
	dpkg-deb --build debian

run: $(TARGET)
	$(TARGET)

clean:
	rm -rf $(OBJS)
