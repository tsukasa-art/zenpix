cmake_minimum_required(VERSION 3.18)
project(zenpix-c C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# ── Release flags ──────────────────────────────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
set(CMAKE_C_FLAGS_RELEASE "-O2 -march=native -DNDEBUG")
set(CMAKE_C_FLAGS_DEBUG   "-O0 -g -fsanitize=address,undefined")

# ── Find libraries (Homebrew on macOS) ─────────────────────────────────────
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBAVIF   REQUIRED libavif)
pkg_check_modules(LIBWEBP   REQUIRED libwebp)
pkg_check_modules(LIBWEBPMUX REQUIRED libwebpmux)
pkg_check_modules(LIBWEBPDEMUX REQUIRED libwebpdemux)
pkg_check_modules(LIBJPEG   REQUIRED libjpeg)
pkg_check_modules(LIBPNG    REQUIRED libpng)
pkg_check_modules(LIBHEIF   REQUIRED libheif)

# ── Sources ────────────────────────────────────────────────────────────────
set(PICT_SOURCES
  src/avif_decode.c
  src/avif_encode.c
  src/gif_decode.c
  src/heic_decode.c
  src/jpeg_decode.c
  src/png_decode.c
  src/webp_decode.c
  src/webp_encode.c
  src/resize.c
  src/pict.c
)

# ── Shared library: libpict ────────────────────────────────────────────────
add_library(pict SHARED ${PICT_SOURCES})

target_include_directories(pict PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${LIBAVIF_INCLUDE_DIRS}
  ${LIBWEBP_INCLUDE_DIRS}
  ${LIBJPEG_INCLUDE_DIRS}
  ${LIBPNG_INCLUDE_DIRS}
  ${LIBHEIF_INCLUDE_DIRS}
)

target_link_libraries(pict PRIVATE
  ${LIBAVIF_LIBRARIES}
  ${LIBWEBP_LIBRARIES}
  ${LIBWEBPMUX_LIBRARIES}
  ${LIBWEBPDEMUX_LIBRARIES}
  ${LIBJPEG_LIBRARIES}
  ${LIBPNG_LIBRARIES}
  ${LIBHEIF_LIBRARIES}
  m        # math (sinf, etc.)
  pthread
)

target_link_directories(pict PRIVATE
  ${LIBAVIF_LIBRARY_DIRS}
  ${LIBWEBP_LIBRARY_DIRS}
  ${LIBJPEG_LIBRARY_DIRS}
  ${LIBPNG_LIBRARY_DIRS}
  ${LIBHEIF_LIBRARY_DIRS}
)

# ── Install ────────────────────────────────────────────────────────────────
install(TARGETS pict LIBRARY DESTINATION lib)
install(FILES include/pict_resize.h DESTINATION include)

# ── Summary ───────────────────────────────────────────────────────────────
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "libavif:  ${LIBAVIF_VERSION}")
message(STATUS "libwebp:  ${LIBWEBP_VERSION}")
message(STATUS "libjpeg:  ${LIBJPEG_VERSION}")
message(STATUS "libpng:   ${LIBPNG_VERSION}")
message(STATUS "libheif:  ${LIBHEIF_VERSION}")
