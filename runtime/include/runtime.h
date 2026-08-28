#pragma once

#include <memory>
#include <string>
#include <vector>

#include <libplatform/libplatform.h>
#include <v8.h>

namespace mydb {

class Runtime {
public:
    Runtime(std::string executable, std::string js_root, std::vector<std::string> arguments);
    ~Runtime();
    int run(const std::string& entry);

private:
    std::string executable_;
    std::string js_root_;
    std::vector<std::string> arguments_;
    std::unique_ptr<v8::Platform> platform_;
    v8::Isolate* isolate_ = nullptr;
    v8::ArrayBuffer::Allocator* allocator_ = nullptr;
};

}
