cmake_minimum_required(VERSION 3.20)
project(mydb LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(MYDB_V8_ROOT "" CACHE PATH "V8 checkout or installation root")

if(NOT MYDB_V8_ROOT)
    message(FATAL_ERROR "Set MYDB_V8_ROOT to a V8 installation containing include and lib")
endif()

add_executable(mydb
    runtime/main.cpp
    runtime/v8_runtime.cpp
    runtime/module_loader.cpp
    runtime/bindings/fs.cpp
    runtime/bindings/memory.cpp
    runtime/bindings/runtime.cpp
    runtime/bindings/time.cpp
    runtime/bindings/process.cpp
    runtime/bindings/logging.cpp
    runtime/bindings/debug.cpp
)

target_include_directories(mydb PRIVATE runtime/include "${MYDB_V8_ROOT}/include")
target_link_directories(mydb PRIVATE "${MYDB_V8_ROOT}/lib")
target_link_libraries(mydb PRIVATE v8_monolith pthread dl)
target_compile_definitions(mydb PRIVATE MYDB_JS_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/js")
