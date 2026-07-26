import SwiftUI

/// The swipeable card, ported from Compose.
///
/// Same grammar everywhere in SlyOS: **swipe right to open, swipe left to close.** A reveal layer
/// sits behind the card showing "Open ↗" and "Close ✕", each lighting up once the drag passes the
/// point where it would register — so the gesture teaches itself instead of being something you
/// have to already know.
///
/// Thresholds and travel are Android's: the card follows the finger up to ±320, and commits past
/// ±130. Matching those matters more than it sounds — muscle memory built on one phone should carry
/// to the other.
struct SlyCard<Content: View>: View {

    var onOpen: (() -> Void)?
    var onClose: (() -> Void)?
    /// Corner radius. 16 for list cards, 18 for the wider summary panels, as on Android.
    var cornerRadius: CGFloat = 16
    @ViewBuilder var content: () -> Content

    @Environment(\.palette) private var p
    @State private var dragX: CGFloat = 0

    private let commit: CGFloat = 130
    private let maxTravel: CGFloat = 320

    var body: some View {
        ZStack {
            revealLayer
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: cornerRadius).fill(p.bgElevated))
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                .offset(x: dragX)
                .gesture(swipe)
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }

    /// Behind the card: the two things the gesture can do, lit as you approach them.
    private var revealLayer: some View {
        HStack {
            Text("Open ↗")
                .font(.system(size: T.small))
                .foregroundStyle(dragX > 20 ? p.accent : p.hairline)
            Spacer()
            Text("Close ✕")
                .font(.system(size: T.small))
                .foregroundStyle(dragX < -20 ? p.danger : p.hairline)
        }
        .padding(.horizontal, 22)
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { value in
                // Horizontal only: a vertical drag belongs to the scroll view, and stealing it makes
                // the whole list feel like it is fighting you.
                guard abs(value.translation.width) > abs(value.translation.height) else { return }
                dragX = min(maxTravel, max(-maxTravel, value.translation.width))
            }
            .onEnded { _ in
                let committed = dragX
                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) { dragX = 0 }
                if committed < -commit { onClose?() }
                else if committed > commit { onOpen?() }
            }
    }
}

/// A section header — "WAITING · 3", "WHAT YOU MISSED".
///
/// 11pt bold with 2pt tracking, exactly as Compose sets it. The optional trailing control is how
/// Android puts "Clear all" next to the count it clears.
struct SectionHeader<Trailing: View>: View {
    let title: String
    var tint: Color?
    @ViewBuilder var trailing: () -> Trailing

    @Environment(\.palette) private var p

    var body: some View {
        HStack(alignment: .center) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .tracking(2)
                .foregroundStyle(tint ?? p.inkFaint)
            Spacer()
            trailing()
        }
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: String, tint: Color? = nil) {
        self.init(title: title, tint: tint) { EmptyView() }
    }
}

/// The waiting state used everywhere something is being generated: the orbit, then what it's doing.
///
/// Android pairs a 20pt orbit with a short accent line ("reading your day", "drafting in your
/// voice…"). Naming the work rather than saying "Loading…" is most of why the wait reads as
/// deliberate.
struct SlyWaiting: View {
    let label: String
    var orbit: CGFloat = 20

    @Environment(\.palette) private var p

    init(_ label: String, orbit: CGFloat = 20) {
        self.label = label
        self.orbit = orbit
    }

    var body: some View {
        HStack(spacing: 12) {
            SlyOrbit(size: orbit)
            Text(label)
                .font(.system(size: T.small))
                .foregroundStyle(p.accent)
        }
    }
}

/// A contact avatar: the initial on a coloured disc, with the source badged in the corner.
///
/// 42pt disc inside a 46pt box, matching Compose — the extra 4pt is the room the badge needs to
/// overhang without being clipped.
struct SlyAvatar: View {
    let name: String
    let tint: Color
    var badge: String?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Circle()
                .fill(tint)
                .frame(width: 42, height: 42)
                .overlay(
                    Text(String(name.trimmingCharacters(in: .whitespaces).first?.uppercased() ?? "•"))
                        .font(.system(size: T.body))
                        .foregroundStyle(.white)
                )
            if let badge {
                Image(systemName: badge)
                    .font(.system(size: 9))
                    .foregroundStyle(tint)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(.white))
            }
        }
        .frame(width: 46, height: 46, alignment: .topLeading)
    }
}
