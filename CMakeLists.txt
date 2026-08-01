cmake_minimum_required(VERSION 3.18)

set(ZENPIX_MINIMUM_MACOS_VERSION "12.0" CACHE STRING
    "Minimum macOS version for zenpix native binaries")
if(APPLE AND NOT CMAKE_OSX_DEPLOYMENT_TARGET)
  set(CMAKE_OSX_DEPLOYMENT_TARGET "${ZENPIX_MINIMUM_MACOS_VERSION}"
      CACHE STRING "Minimum macOS version" FORCE)
endif()

project(zenpix C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

option(ZENPIX_ENABLE_SIMD "Enable zenpix RGBA resize SIMD on supported CPUs" ON)
option(ZENPIX_BUILD_TESTS "Build zenpix native resize tests" OFF)
option(ZENPIX_MARCH_NATIVE "Tune a local source build for the current CPU" OFF)

# ── Release flags ──────────────────────────────────────────────────────────
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
if(NOT MSVC)
  # Release artifacts keep the architecture baseline: AArch64 includes NEON,
  # and x86_64 includes SSE2. Native tuning is opt-in for local benchmarking.
  if(ZENPIX_MARCH_NATIVE)
    set(_MARCH_FLAG "-march=native")
  elseif(NOT APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(_MARCH_FLAG "-march=x86-64")
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

# ── zenpix resize SIMD ──────────────────────────────────────────────────────
# AArch64 NEON and x86_64 SSE2 are architecture baselines. Unsupported CPUs,
# or an explicit ZENPIX_ENABLE_SIMD=OFF build, compile the scalar path only.
set(ZENPIX_TARGET_PROCESSOR "${CMAKE_SYSTEM_PROCESSOR}")
if(APPLE AND CMAKE_OSX_ARCHITECTURES)
  list(LENGTH CMAKE_OSX_ARCHITECTURES ZENPIX_OSX_ARCH_COUNT)
  if(ZENPIX_OSX_ARCH_COUNT EQUAL 1)
    list(GET CMAKE_OSX_ARCHITECTURES 0 ZENPIX_TARGET_PROCESSOR)
  else()
    # One intrinsic source cannot represent both slices of a universal binary.
    # Keep universal builds portable instead of selecting the host backend.
    set(ZENPIX_TARGET_PROCESSOR "universal")
  endif()
endif()
string(TOLOWER "${ZENPIX_TARGET_PROCESSOR}" ZENPIX_SYSTEM_PROCESSOR_LOWER)
set(ZENPIX_SIMD_BACKEND "scalar")
set(ZENPIX_SIMD_DEFINITION "")
if(ZENPIX_ENABLE_SIMD)
  if(ZENPIX_SYSTEM_PROCESSOR_LOWER MATCHES "^(arm64|aarch64)$")
    set(ZENPIX_SIMD_BACKEND "NEON")
    set(ZENPIX_SIMD_DEFINITION PICT_SIMD_NEON=1)
  elseif(ZENPIX_SYSTEM_PROCESSOR_LOWER MATCHES "^(x86_64|amd64)$")
    set(ZENPIX_SIMD_BACKEND "SSE2")
    set(ZENPIX_SIMD_DEFINITION PICT_SIMD_SSE2=1)
  endif()
endif()
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
if(ZENPIX_SIMD_DEFINITION)
  target_compile_definitions(pict PRIVATE ${ZENPIX_SIMD_DEFINITION})
endif()

# ── Platform-specific dependencies ────────────────────────────────────────
# vcpkg path: Windows always, Linux/macOS when VCPKG_TARGET_TRIPLET is set
if(WIN32 OR DEFINED VCPKG_TARGET_TRIPLET)
  find_package(libavif CONFIG REQUIRED)
  find_package(WebP    CONFIG REQUIRED)
  find_package(JPEG           REQUIRED)
  find_package(PNG            REQUIRED)

  if(WIN32)
    target_compile_definitions(pict PRIVATE PICT_DISABLE_HEIC)
  endif()
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

# ── Native resize verification ─────────────────────────────────────────────
if(ZENPIX_BUILD_TESTS)
  enable_testing()
  add_executable(test_resize_simd
    test/test_resize_simd.c
    src/resize.c
  )
  target_include_directories(test_resize_simd PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/src
  )
  target_compile_definitions(test_resize_simd PRIVATE PICT_RESIZE_TESTING=1)
  if(ZENPIX_SIMD_DEFINITION)
    target_compile_definitions(test_resize_simd PRIVATE ${ZENPIX_SIMD_DEFINITION})
  endif()
  if(NOT WIN32)
    target_link_libraries(test_resize_simd PRIVATE m pthread)
  endif()
  add_test(NAME resize_simd_correctness COMMAND test_resize_simd)
endif()

# ── Summary ───────────────────────────────────────────────────────────────
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "Platform:   ${CMAKE_SYSTEM_NAME}")
message(STATUS "zenpix resize SIMD: ${ZENPIX_SIMD_BACKEND}")
if(APPLE)
  message(STATUS "macOS deployment target: ${CMAKE_OSX_DEPLOYMENT_TARGET}")
endif()
if(DEFINED VCPKG_TARGET_TRIPLET)
  message(STATUS "codec dependencies: vcpkg manifest (${VCPKG_TARGET_TRIPLET})")
elseif(NOT WIN32)
  message(STATUS "libavif:  ${LIBAVIF_VERSION}")
  message(STATUS "libwebp:  ${LIBWEBP_VERSION}")
  message(STATUS "libjpeg:  ${LIBJPEG_VERSION}")
  message(STATUS "libpng:   ${LIBPNG_VERSION}")
  message(STATUS "libheif:  runtime dlopen (optional)")
endif()
