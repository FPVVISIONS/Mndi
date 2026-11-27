cmake_minimum_required(VERSION 3.22.1)
project("marquee")

set(CMAKE_CXX_STANDARD 17)

add_library(native-lib SHARED native-lib.cpp)

# nodejs-mobile ships Node as a shared library plus its headers (fetched into app/libnode).
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION ${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode/bin/${ANDROID_ABI}/libnode.so)

find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})
