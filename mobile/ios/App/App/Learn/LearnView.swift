import SwiftUI

struct LearnView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Courses")
                        .font(.title2.bold())
                        .foregroundColor(AppTheme.ink)
                    Text("Course loading and lesson reading use the native mobile APIs.")
                        .foregroundColor(AppTheme.secondaryInk)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.accentSoft)
                        .cornerRadius(14)
                }
                .padding()
            }
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            .navigationTitle("Learn")
        }
    }
}
