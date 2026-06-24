import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Continue Learning")
                        .font(.title2.bold())
                        .foregroundColor(AppTheme.ink)
                    Text("Your next lesson will appear here after dashboard loading is connected.")
                        .foregroundColor(AppTheme.secondaryInk)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(AppTheme.accentSoft)
                        .cornerRadius(14)
                }
                .padding()
            }
            .background(AppTheme.paper.edgesIgnoringSafeArea(.all))
            .navigationTitle("Home")
        }
    }
}
