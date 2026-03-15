#!/usr/bin/env swift

import Foundation
import Vision
import AppKit

struct Bounds: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct TextObservationResult: Codable {
    let text: String
    let confidence: Double
    let bounds: Bounds
}

struct RectangleObservationResult: Codable {
    let confidence: Double
    let bounds: Bounds
}

struct DetectionResult: Codable {
    let image: Bounds
    let texts: [TextObservationResult]
    let rectangles: [RectangleObservationResult]
}

struct Arguments {
    let imagePath: String
    let mode: String
    let phase: String
}

struct DetectionProfile {
    let recognitionLevel: VNRequestTextRecognitionLevel
    let minimumTextHeight: Float
    let useLanguageCorrection: Bool
    let rectangleMinimumConfidence: Float
    let rectangleMaximumObservations: Int
    let rectangleMinimumAspectRatio: VNAspectRatio
    let rectangleMinimumSize: Float
    let quadratureTolerance: Float
}

func parseArgs() -> Arguments? {
    let args = CommandLine.arguments
    guard let imageIndex = args.firstIndex(of: "--image"), imageIndex + 1 < args.count else {
        return nil
    }

    let mode: String
    if let modeIndex = args.firstIndex(of: "--mode"), modeIndex + 1 < args.count {
        mode = args[modeIndex + 1]
    } else {
        mode = "balanced"
    }

    let phase: String
    if let phaseIndex = args.firstIndex(of: "--phase"), phaseIndex + 1 < args.count {
        phase = args[phaseIndex + 1]
    } else {
        phase = "primary"
    }

    return Arguments(imagePath: args[imageIndex + 1], mode: mode, phase: phase)
}

func makeProfile(mode: String, phase: String) -> DetectionProfile {
    if phase == "refine" {
        if mode == "precise" {
            return DetectionProfile(
                recognitionLevel: .accurate,
                minimumTextHeight: 0.009,
                useLanguageCorrection: false,
                rectangleMinimumConfidence: 0.42,
                rectangleMaximumObservations: 280,
                rectangleMinimumAspectRatio: 0.12,
                rectangleMinimumSize: 0.012,
                quadratureTolerance: 16.0
            )
        }

        return DetectionProfile(
            recognitionLevel: .accurate,
            minimumTextHeight: 0.011,
            useLanguageCorrection: false,
            rectangleMinimumConfidence: 0.45,
            rectangleMaximumObservations: 220,
            rectangleMinimumAspectRatio: 0.14,
            rectangleMinimumSize: 0.014,
            quadratureTolerance: 17.0
        )
    }

    if mode == "fast" {
        return DetectionProfile(
            recognitionLevel: .fast,
            minimumTextHeight: 0.02,
            useLanguageCorrection: false,
            rectangleMinimumConfidence: 0.56,
            rectangleMaximumObservations: 90,
            rectangleMinimumAspectRatio: 0.18,
            rectangleMinimumSize: 0.024,
            quadratureTolerance: 22.0
        )
    }

    if mode == "precise" {
        return DetectionProfile(
            recognitionLevel: .accurate,
            minimumTextHeight: 0.012,
            useLanguageCorrection: false,
            rectangleMinimumConfidence: 0.45,
            rectangleMaximumObservations: 220,
            rectangleMinimumAspectRatio: 0.14,
            rectangleMinimumSize: 0.015,
            quadratureTolerance: 18.0
        )
    }

    return DetectionProfile(
        recognitionLevel: .fast,
        minimumTextHeight: 0.016,
        useLanguageCorrection: false,
        rectangleMinimumConfidence: 0.5,
        rectangleMaximumObservations: 140,
        rectangleMinimumAspectRatio: 0.16,
        rectangleMinimumSize: 0.02,
        quadratureTolerance: 20.0
    )
}

func convert(_ rect: CGRect, imageWidth: CGFloat, imageHeight: CGFloat) -> Bounds {
    let width = Int(round(rect.width * imageWidth))
    let height = Int(round(rect.height * imageHeight))
    let x = Int(round(rect.origin.x * imageWidth))
    let y = Int(round((1.0 - rect.origin.y - rect.height) * imageHeight))
    return Bounds(x: max(0, x), y: max(0, y), width: max(1, width), height: max(1, height))
}

guard let arguments = parseArgs() else {
    FileHandle.standardError.write(Data("Missing --image path\n".utf8))
    exit(1)
}

let imageURL = URL(fileURLWithPath: arguments.imagePath)
guard let nsImage = NSImage(contentsOf: imageURL) else {
    FileHandle.standardError.write(Data("Unable to load image\n".utf8))
    exit(1)
}

var proposedRect = CGRect(origin: .zero, size: nsImage.size)
guard let cgImage = nsImage.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    FileHandle.standardError.write(Data("Unable to create CGImage\n".utf8))
    exit(1)
}

let imageWidth = CGFloat(cgImage.width)
let imageHeight = CGFloat(cgImage.height)
let profile = makeProfile(mode: arguments.mode, phase: arguments.phase)

let textRequest = VNRecognizeTextRequest()
textRequest.recognitionLevel = profile.recognitionLevel
textRequest.usesLanguageCorrection = profile.useLanguageCorrection
textRequest.minimumTextHeight = profile.minimumTextHeight

let rectangleRequest = VNDetectRectanglesRequest()
rectangleRequest.minimumConfidence = profile.rectangleMinimumConfidence
rectangleRequest.maximumObservations = profile.rectangleMaximumObservations
rectangleRequest.minimumAspectRatio = profile.rectangleMinimumAspectRatio
rectangleRequest.minimumSize = profile.rectangleMinimumSize
rectangleRequest.quadratureTolerance = profile.quadratureTolerance

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([textRequest, rectangleRequest])
} catch {
    FileHandle.standardError.write(Data("Vision request failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}

let textResults: [TextObservationResult] = (textRequest.results ?? []).compactMap { observation in
    guard let candidate = observation.topCandidates(1).first else {
        return nil
    }
    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
        return nil
    }
    return TextObservationResult(
        text: text,
        confidence: Double(candidate.confidence),
        bounds: convert(observation.boundingBox, imageWidth: imageWidth, imageHeight: imageHeight)
    )
}.sorted { lhs, rhs in
    if lhs.bounds.y == rhs.bounds.y { return lhs.bounds.x < rhs.bounds.x }
    return lhs.bounds.y < rhs.bounds.y
}

let rectangleResults: [RectangleObservationResult] = (rectangleRequest.results ?? []).map { observation in
    RectangleObservationResult(
        confidence: Double(observation.confidence),
        bounds: convert(observation.boundingBox, imageWidth: imageWidth, imageHeight: imageHeight)
    )
}.sorted { lhs, rhs in
    if lhs.bounds.y == rhs.bounds.y { return lhs.bounds.x < rhs.bounds.x }
    return lhs.bounds.y < rhs.bounds.y
}

let output = DetectionResult(
    image: Bounds(x: 0, y: 0, width: Int(imageWidth), height: Int(imageHeight)),
    texts: textResults,
    rectangles: rectangleResults
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

do {
    let data = try encoder.encode(output)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Encoding failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}