import SwiftUI

struct ExamView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var viewModel = ExamViewModel(
        api: APIClient(baseURL: URL(string: "https://pacificdrone.ca")!)
    )

    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Text(viewModel.status)
                    .foregroundColor(AppTheme.secondaryInk)

                Button {
                    start(certLevel: "BASIC")
                } label: {
                    Text("Start Basic Mock Exam")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundColor(.white)
                .background(AppTheme.accent)
                .cornerRadius(10)

                Button {
                    start(certLevel: "ADVANCED")
                } label: {
                    Text("Start Advanced Mock Exam")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .foregroundColor(AppTheme.accent)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(AppTheme.accent, lineWidth: 1)
                )
            }
            .padding()
            .navigationTitle("Exam")
        }
    }

    private func start(certLevel: String) {
        guard let token = auth.token else { return }
        Task { await viewModel.start(certLevel: certLevel, token: token) }
    }
}
