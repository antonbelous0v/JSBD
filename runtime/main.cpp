#include "runtime.h"

#include <exception>
#include <iostream>

int main(int argc, char** argv) {
    try {
        std::vector<std::string> arguments(argv, argv + argc);
        mydb::Runtime runtime(argv[0], MYDB_JS_ROOT, std::move(arguments));
        return runtime.run("bootstrap.js");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
