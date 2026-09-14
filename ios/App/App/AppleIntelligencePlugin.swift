import Foundation
import Capacitor
#if canImport(FoundationModels)
import FoundationModels
#endif

/// The on-device language model (Apple Intelligence, iOS 26+) for the web
/// layer's "Apple Intelligence" opponent (src/ai/onDeviceModel.ts).
/// `availability` says whether the system model can be used on this
/// device right now; `selectMove` runs one guided-generation request and
/// returns the chosen move index with a short reasoning (generated first,
/// so the choice follows from it); `cancel` abandons a request the web
/// layer no longer wants. Every request has a deadline: when it passes,
/// the call is rejected and the generation is cancelled, so the game can
/// fall back instead of waiting forever. `prewarm` loads the model and
/// prepares the next session with the given instructions ahead of time
/// (the web layer calls it while the human is thinking); `selectMove`
/// uses that session when the instructions match, and `releaseSession`
/// drops it when the game is over. Nothing leaves the device. On older
/// systems everything reports "unavailable".
@objc(AppleIntelligencePlugin)
public class AppleIntelligencePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIntelligencePlugin"
    public let jsName = "AppleIntelligence"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "availability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectMove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prewarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseSession", returnType: CAPPluginReturnPromise),
    ]

    private let inflight = InflightRequests()
    private let prepared = PreparedSession()

    @objc func availability(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["available": true])
            case .unavailable(let reason):
                call.resolve(["available": false, "reason": Self.describe(reason)])
            }
            return
        }
        #endif
        call.resolve(["available": false, "reason": "requires iOS 26 or later"])
    }

    @objc func selectMove(_ call: CAPPluginCall) {
        guard let instructions = call.getString("instructions"), !instructions.isEmpty,
              let prompt = call.getString("prompt"), !prompt.isEmpty,
              let moveCount = call.getInt("moveCount"), moveCount > 0 else {
            call.reject("instructions, prompt and moveCount are required")
            return
        }
        let requestId = call.getString("requestId") ?? UUID().uuidString
        let timeoutMs = max(1_000, call.getInt("timeoutMs") ?? 20_000)
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let inflight = self.inflight
            let prepared = self.prepared
            let settled = Settled()
            let task = Task {
                // One session per move: the model's context window is small
                // and every request already carries the whole position. The
                // session prepared by `prewarm` is used when its instructions
                // match, otherwise a fresh one is made here.
                let work = Task { () -> MoveAnswer in
                    let session = prepared.take(for: instructions) as? LanguageModelSession
                        ?? LanguageModelSession(instructions: instructions)
                    let options = GenerationOptions(temperature: 0.5, maximumResponseTokens: 384)
                    let schema = try Self.moveChoiceSchema(moveCount: moveCount)
                    let content = try await session.respond(to: prompt, schema: schema, options: options).content
                    return try MoveAnswer(content)
                }
                let deadline = Task {
                    try? await Task.sleep(nanoseconds: UInt64(timeoutMs) * 1_000_000)
                    guard !Task.isCancelled, settled.settle() else { return }
                    call.reject("On-device model timed out after \(timeoutMs) ms")
                    work.cancel()
                }
                await withTaskCancellationHandler {
                    do {
                        let answer = try await work.value
                        if settled.settle() {
                            call.resolve([
                                "moveIndex": answer.moveIndex,
                                "reasoning": answer.reasoning,
                                "candidates": answer.candidates.map { ["moveIndex": $0.moveIndex, "note": $0.note] },
                            ])
                        }
                    } catch {
                        if settled.settle() {
                            call.reject("On-device model failed: \(error.localizedDescription)")
                        }
                    }
                    deadline.cancel()
                } onCancel: {
                    work.cancel()
                    deadline.cancel()
                    if settled.settle() {
                        call.reject("On-device model request cancelled")
                    }
                }
                inflight.remove(requestId)
            }
            inflight.set(requestId, task)
            return
        }
        #endif
        call.reject("requires iOS 26 or later")
    }

    /// Abandon a request: the generation is cancelled and the pending call
    /// rejects with "cancelled" (a no-op for an unknown or finished id).
    @objc func cancel(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId"), !requestId.isEmpty else {
            call.reject("requestId is required")
            return
        }
        inflight.cancel(requestId)
        call.resolve()
    }

    /// Load the model and prepare a session with these instructions so the
    /// next `selectMove` with the same instructions starts without the
    /// model load and the instruction prefill. Resolves at once; the work
    /// happens in the background. A no-op where the model is unavailable.
    @objc func prewarm(_ call: CAPPluginCall) {
        guard let instructions = call.getString("instructions"), !instructions.isEmpty else {
            call.reject("instructions are required")
            return
        }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if case .available = SystemLanguageModel.default.availability {
                let session = LanguageModelSession(instructions: instructions)
                session.prewarm(promptPrefix: nil)
                prepared.store(session, for: instructions)
            }
        }
        #endif
        call.resolve()
    }

    /// Drop the prepared session (the game is over or was left).
    @objc func releaseSession(_ call: CAPPluginCall) {
        prepared.clear()
        call.resolve()
    }

    #if canImport(FoundationModels)
    /// The answer shape, built per request so the move index can carry a
    /// range guide of 0 to moveCount - 1: constrained decoding then makes
    /// an out-of-range index impossible (a compile-time @Generable type
    /// cannot know the number of legal moves). Generated in this order: a
    /// counted list of the strongest moves with a short note each, the
    /// one-sentence verdict, then the index, so the choice is conditioned
    /// on the comparison (Apple's prompting guidance). The list is counted
    /// rather than free text because free text sometimes kept listing
    /// moves until the token budget ran out and the answer failed to
    /// decode.
    @available(iOS 26.0, *)
    static func moveChoiceSchema(moveCount: Int) throws -> GenerationSchema {
        let index = DynamicGenerationSchema(type: Int.self, guides: [.range(0...max(0, moveCount - 1))])
        let candidate = DynamicGenerationSchema(
            name: "Candidate",
            description: "One of the legal moves being weighed",
            properties: [
                .init(name: "moveIndex", description: "The number of this move in the numbered list of legal moves", schema: index),
                .init(name: "note", description: "At most twelve words: what this move captures or risks", schema: DynamicGenerationSchema(type: String.self)),
            ]
        )
        let choice = DynamicGenerationSchema(
            name: "MoveChoice",
            description: "The move to play, chosen after weighing the strongest legal moves",
            properties: [
                .init(name: "candidates", description: "The two or three strongest legal moves",
                      schema: DynamicGenerationSchema(arrayOf: DynamicGenerationSchema(referenceTo: "Candidate"), minimumElements: min(2, moveCount), maximumElements: min(3, moveCount))),
                .init(name: "reasoning", description: "One sentence: which of those moves is best and why", schema: DynamicGenerationSchema(type: String.self)),
                .init(name: "moveIndex", description: "The number of that best move in the numbered list of legal moves", schema: index),
            ]
        )
        return try GenerationSchema(root: choice, dependencies: [candidate])
    }

    @available(iOS 26.0, *)
    private static func describe(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible: return "device not eligible"
        case .appleIntelligenceNotEnabled: return "Apple Intelligence not enabled"
        case .modelNotReady: return "model not ready"
        @unknown default: return "unavailable"
        }
    }
    #endif
}

/// Exactly one outcome per call: whichever of completion, deadline or
/// cancellation comes first wins, the others are ignored.
private final class Settled {
    private let lock = NSLock()
    private var done = false
    func settle() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}

/// At most one session prepared ahead of time, keyed by its instructions.
/// Taking it hands it to exactly one request; a session is never shared.
private final class PreparedSession {
    private let lock = NSLock()
    private var instructions = ""
    private var session: Any?

    func store(_ session: Any, for instructions: String) {
        lock.lock()
        self.session = session
        self.instructions = instructions
        lock.unlock()
    }

    func take(for instructions: String) -> Any? {
        lock.lock()
        defer { lock.unlock() }
        guard self.instructions == instructions, let session = session else { return nil }
        self.session = nil
        return session
    }

    func clear() {
        lock.lock()
        session = nil
        lock.unlock()
    }
}

/// The requests still running, by id, so the web layer can cancel one.
private final class InflightRequests {
    private let lock = NSLock()
    private var tasks: [String: Task<Void, Never>] = [:]

    func set(_ id: String, _ task: Task<Void, Never>) {
        lock.lock()
        let previous = tasks.updateValue(task, forKey: id)
        lock.unlock()
        previous?.cancel()
    }

    func cancel(_ id: String) {
        lock.lock()
        let task = tasks.removeValue(forKey: id)
        lock.unlock()
        task?.cancel()
    }

    func remove(_ id: String) {
        lock.lock()
        tasks.removeValue(forKey: id)
        lock.unlock()
    }
}

#if canImport(FoundationModels)
/// The decoded answer (see `moveChoiceSchema`). The index is required;
/// the notes and the verdict are best effort.
@available(iOS 26.0, *)
struct MoveAnswer: Sendable {
    let moveIndex: Int
    let reasoning: String
    let candidates: [(moveIndex: Int, note: String)]

    init(_ content: GeneratedContent) throws {
        moveIndex = try content.value(Int.self, forProperty: "moveIndex")
        reasoning = (try? content.value(String.self, forProperty: "reasoning")) ?? ""
        let items = (try? content.value([GeneratedContent].self, forProperty: "candidates")) ?? []
        candidates = items.compactMap { item in
            guard let index = try? item.value(Int.self, forProperty: "moveIndex") else { return nil }
            return (moveIndex: index, note: (try? item.value(String.self, forProperty: "note")) ?? "")
        }
    }
}
#endif
