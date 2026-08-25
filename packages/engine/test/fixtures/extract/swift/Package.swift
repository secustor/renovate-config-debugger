// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "Demo",
  dependencies: [
    .package(url: "https://github.com/apple/swift-log.git", from: "1.5.4"),
    .package(url: "https://github.com/apple/swift-argument-parser.git", exact: "1.4.0"),
  ],
  targets: [
    .target(name: "Demo")
  ]
)
