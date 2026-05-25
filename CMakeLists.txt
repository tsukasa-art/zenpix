cmake_minimum_required(VERSION 3.18)
project(zenpix C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# ── Release flags ──────────────────────────────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
if(NOT MSVC)
  # macOS: native is fine (local dev only). Linux: portable AVX2 baseline so
  # CI-built binaries run on any x86-64 that has AVX2 (no AVX-512 required).
  # Override: cmake -DZENPIX_MARCH_NATIVE=ON for a source build on the target machine.
  if(APPLE)
    set(_MARCH_FLAG "-march=native")
  elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    if(ZENPIX_MARCH_NATIVE)
      set(_MARCH_FLAG "-march=native")
    else()
      set(_MARCH_FLAG "-march=x86-64-v3")
    endif()
  else()
    set(_MARCH_FLAG "")
  endif()
  set(CMAKE_C_FLAGS_RELEASE "-O2 ${_MARCH_FLAG} -DNDEBUG")
  set(CMAKE_C_FLAGS_DEBUG   "-O0 -g -fsanitize=address,undefined")
endif()

# ── Windows: put DLL directly in build/ (not build/Release/) ──────────────
if(WIN32)
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY         ${CMAKE_BINARY_DIR})
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR})
  set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG   ${CMAKE_BINARY_DIR})
endif()

# ── Sources ────────────────────────────────────────────────────────────────
set(PICT_SOURCES
  src/avif_decode.c
  src/avif_encode.c
  src/gif_decode.c
  src/jpeg_decode.c
  src/png_decode.c
  src/webp_decode.c
  src/webp_encode.c
  src/resize.c
  src/pict.c
)
if(NOT WIN32)
  list(APPEND PICT_SOURCES src/heic_decode.c)
endif()

# ── Shared library: libpict ────────────────────────────────────────────────
add_library(pict SHARED ${PICT_SOURCES})
set_target_properties(pict PROPERTIES
  PREFIX "lib"
  WINDOWS_EXPORT_ALL_SYMBOLS ON
)

target_include_directories(pict PRIVATE ${CMAKE_SOURCE_DIR}/include)

# ── Platform-specific dependencies ────────────────────────────────────────
if(WIN32)
  # vcpkg provides these via CMAKE_TOOLCHAIN_FILE
  find_package(libavif CONFIG REQUIRED)
  find_package(WebP    CONFIG REQUIRED)
  find_package(JPEG           REQUIRED)
  find_package(PNG            REQUIRED)

  target_compile_definitions(pict PRIVATE PICT_DISABLE_HEIC)
  target_link_libraries(pict PRIVATE
    avif
    WebP::webp WebP::webpdemux WebP::libwebpmux
    JPEG::JPEG
    PNG::PNG
  )
else()
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(LIBAVIF    REQUIRED libavif)
  pkg_check_modules(LIBWEBP    REQUIRED libwebp)
  pkg_check_modules(LIBWEBPMUX    REQUIRED libwebpmux)
  pkg_check_modules(LIBWEBPDEMUX  REQUIRED libwebpdemux)
  pkg_check_modules(LIBJPEG    REQUIRED libjpeg)
  pkg_check_modules(LIBPNG     REQUIRED libpng)
  # libheif is loaded at runtime via dlopen() — no link-time dependency.
  # heic_decode.c uses dlopen/dlsym and falls back gracefully if not installed.

  target_include_directories(pict PRIVATE
    ${LIBAVIF_INCLUDE_DIRS}
    ${LIBWEBP_INCLUDE_DIRS}
    ${LIBJPEG_INCLUDE_DIRS}
    ${LIBPNG_INCLUDE_DIRS}
  )
  target_link_libraries(pict PRIVATE
    ${LIBAVIF_LIBRARIES}
    ${LIBWEBP_LIBRARIES}
    ${LIBWEBPMUX_LIBRARIES}
    ${LIBWEBPDEMUX_LIBRARIES}
    ${LIBJPEG_LIBRARIES}
    ${LIBPNG_LIBRARIES}
    m pthread dl
  )
  target_link_directories(pict PRIVATE
    ${LIBAVIF_LIBRARY_DIRS}
    ${LIBWEBP_LIBRARY_DIRS}
    ${LIBJPEG_LIBRARY_DIRS}
    ${LIBPNG_LIBRARY_DIRS}
  )
endif()

# ── Install ────────────────────────────────────────────────────────────────
install(TARGETS pict LIBRARY DESTINATION lib RUNTIME DESTINATION bin)
install(FILES include/pict_resize.h DESTINATION include)

# ── Summary ───────────────────────────────────────────────────────────────
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Platform:   ${CMAKE_SYSTEM_NAME}")
if(NOT WIN32)
  message(STATUS "libavif:  ${LIBAVIF_VERSION}")
  message(STATUS "libwebp:  ${LIBWEBP_VERSION}")
  message(STATUS "libjpeg:  ${LIBJPEG_VERSION}")
  message(STATUS "libpng:   ${LIBPNG_VERSION}")
  message(STATUS "libheif:  runtime dlopen (optional)")
endif()
