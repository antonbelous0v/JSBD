#include "module_loader.h"

#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace mydb {

namespace {
thread_local ModuleLoader* active_loader = nullptr;

std::string utf8(v8::Isolate* isolate, v8::Local<v8::String> value) {
    v8::String::Utf8Value text(isolate, value);
    return *text ? *text : "";
}
}

ModuleLoader::ModuleLoader(v8::Isolate* isolate, std::string root)
    : isolate_(isolate), root_(std::filesystem::weakly_canonical(root).string()) {
    active_loader = this;
}

v8::MaybeLocal<v8::Module> ModuleLoader::load(v8::Local<v8::Context> context, const std::string& path) {
    return compile(context, normalize(path, root_ + "/bootstrap.js"));
}

v8::MaybeLocal<v8::Module> ModuleLoader::compile(v8::Local<v8::Context> context, const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Cannot open module: " + path);
    std::ostringstream stream;
    stream << file.rdbuf();
    auto source_text = v8::String::NewFromUtf8(isolate_, stream.str().c_str()).ToLocalChecked();
    auto name = v8::String::NewFromUtf8(isolate_, path.c_str()).ToLocalChecked();
    v8::ScriptOrigin origin(name, 0, 0, false, -1, v8::Local<v8::Value>(), false, false, true);
    v8::ScriptCompiler::Source source(source_text, origin);
    return v8::ScriptCompiler::CompileModule(isolate_, &source);
}

std::string ModuleLoader::normalize(const std::string& specifier, const std::string& referrer) const {
    auto path = specifier.starts_with(".")
        ? std::filesystem::path(referrer).parent_path() / specifier
        : std::filesystem::path(root_) / specifier;
    auto normalized = std::filesystem::weakly_canonical(path);
    auto root = std::filesystem::path(root_);
    auto [root_end, path_end] = std::mismatch(root.begin(), root.end(), normalized.begin(), normalized.end());
    if (root_end != root.end()) throw std::runtime_error("Module path escapes JavaScript root");
    return normalized.string();
}

v8::MaybeLocal<v8::Module> ModuleLoader::resolve(v8::Local<v8::Context> context, v8::Local<v8::String> specifier, v8::Local<v8::FixedArray>, v8::Local<v8::Module> referrer) {
    auto isolate = active_loader->isolate_;
    auto origin = referrer->GetResourceName().As<v8::String>();
    return active_loader->compile(context, active_loader->normalize(utf8(isolate, specifier), utf8(isolate, origin)));
}

}
