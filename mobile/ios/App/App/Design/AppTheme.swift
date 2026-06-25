import SwiftUI

enum AppTheme {
    static let paper = Color(red: 0.984, green: 0.984, blue: 0.976)
    static let surface = Color.white
    static let ink = Color(red: 0.071, green: 0.114, blue: 0.212)
    static let secondaryInk = Color(red: 0.196, green: 0.247, blue: 0.337)
    static let accent = Color(red: 0.722, green: 0.314, blue: 0.118)
    static let accentSoft = Color(red: 0.969, green: 0.922, blue: 0.886)
    static let green = Color(red: 0.118, green: 0.478, blue: 0.302)
    static let border = Color(red: 0.902, green: 0.894, blue: 0.863)

    // 4/8pt spacing + radius tokens — one source so every card/screen lines up.
    static let corner: CGFloat = 14
    static let cornerSmall: CGFloat = 12
    static let cardPadding: CGFloat = 16
    static let gap: CGFloat = 16
    static let gapSmall: CGFloat = 8
    static let controlHeight: CGFloat = 50
}

/// Shared white card: consistent padding, radius, and hairline border everywhere.
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(AppTheme.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.surface)
            .cornerRadius(AppTheme.corner)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.corner)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardStyle()) }
}

/// Filled accent CTA, full width, 50pt tall. Greys out when disabled.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        PrimaryButtonBody(configuration: configuration)
    }

    private struct PrimaryButtonBody: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: AppTheme.controlHeight)
                .background(isEnabled ? AppTheme.accent : AppTheme.border)
                .foregroundColor(.white)
                .cornerRadius(AppTheme.cornerSmall)
                .opacity(configuration.isPressed ? 0.85 : 1)
        }
    }
}

/// Outlined accent button, same footprint as PrimaryButtonStyle.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: AppTheme.controlHeight)
            .foregroundColor(AppTheme.accent)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.cornerSmall)
                    .stroke(AppTheme.accent, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
