# iOS Sample App - Photo Verification

import SwiftUI
import Photos
import UIKit
import C2ConciergeMobile

@main
struct SampleApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var selectedImage: PHAsset?
    @State private var verificationResult: VerifyResult?
    @State private var showingResults = false
    @State private var showingImagePicker = false
    @State private var isLoading = false
    
    private let config = C2CConfig(
        relayBaseURL: URL(string: "https://verify.c2concierge.org")!,
        pinnedSPKIHashes: [
            "9lDwM0oT7cR1d8X5vK2sJ6hG4fY3nB2qZ7wP5rE1tA0=",
            "Y7eH3kL9mN2qJ8rW5vX1sD4fG6hB9pZ3nC2tA0oP7eR="
        ],
        enableDebugLogging: false
    )
    
    private lazy var verifier = C2CMobileVerifier(config: config)
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("C2 Concierge Mobile")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Verify Content Credentials")
                    .font(.headline)
                    .foregroundColor(.secondary)
                
                if let asset = selectedImage {
                    AssetImageView(asset: asset)
                        .frame(maxHeight: 200)
                        .cornerRadius(12)
                        .shadow(radius: 4)
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 200)
                        .overlay(
                            VStack {
                                Image(systemName: "photo")
                                    .font(.system(size: 50))
                                    .foregroundColor(.gray)
                                Text("No image selected")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                        )
                }
                
                VStack(spacing: 12) {
                    Button(action: {
                        showingImagePicker = true
                    }) {
                        HStack {
                            Image(systemName: "photo.on.rectangle")
                            Text("Select Photo")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(isLoading)
                    
                    if selectedImage != nil {
                        Button(action: {
                            verifyImage()
                        }) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        .scaleEffect(0.8)
                                }
                                Text(isLoading ? "Verifying..." : "Verify Credentials")
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(isLoading ? Color.gray : Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(isLoading)
                    }
                }
                .padding(.horizontal)
                
                Spacer()
            }
            .padding()
            .navigationTitle("C2 Concierge")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showingImagePicker) {
            ImagePicker(selectedAsset: $selectedImage)
        }
        .alert("Verification Results", isPresented: $showingResults) {
            Button("OK") { }
        } message: {
            if let result = verificationResult {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Status: \(result.state.displayName)")
                        .fontWeight(.bold)
                        .foregroundColor(result.isSuccessful ? .green : .red)
                    
                    if let issuer = result.issuerDisplayName {
                        Text("Issuer: \(issuer)")
                    }
                    
                    if let time = result.timestamp {
                        Text("Verified: \(result.verificationTime)")
                    }
                    
                    if !result.messages.isEmpty {
                        Text("Messages:")
                            .fontWeight(.semibold)
                        ForEach(result.messages, id: \.self) { message in
                            Text("• \(message)")
                        }
                    }
                }
            }
        }
    }
    
    private func verifyImage() {
        guard let asset = selectedImage else { return }
        
        isLoading = true
        verifier.verify(localAsset: asset) { result in
            DispatchQueue.main.async {
                self.verificationResult = result
                self.showingResults = true
                self.isLoading = false
            }
        }
    }
}

struct AssetImageView: View {
    let asset: PHAsset
    
    var body: some View {
        PHAssetImageView(asset: asset)
            .aspectRatio(contentMode: .fit)
    }
}

struct PHAssetImageView: UIViewRepresentable {
    let asset: PHAsset
    
    func makeUIView(context: Context) -> UIImageView {
        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFit
        imageView.clipsToBounds = true
        return imageView
    }
    
    func updateUIView(_ uiView: UIImageView, context: Context) {
        let imageManager = PHImageManager.default()
        let requestOptions = PHImageRequestOptions()
        requestOptions.deliveryMode = .highQualityFormat
        requestOptions.isNetworkAccessAllowed = true
        
        let targetSize = CGSize(width: 400, height: 400)
        imageManager.requestImage(for: asset, targetSize: targetSize, contentMode: .aspectFit, options: requestOptions) { image, _ in
            DispatchQueue.main.async {
                uiView.image = image
            }
        }
    }
}

struct ImagePicker: UIViewControllerRepresentable {
    @Binding var selectedAsset: PHAsset?
    @Environment(\.presentationMode) var presentationMode
    
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1
        
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: ImagePicker
        
        init(_ parent: ImagePicker) {
            self.parent = parent
        }
        
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            
            guard let provider = results.first?.itemProvider else { return }
            
            if provider.canLoadObject(ofClass: UIImage.self) {
                provider.loadObject(ofClass: UIImage.self) { image, _ in
                    DispatchQueue.main.async {
                        // For demo purposes, we'll use a mock asset
                        // In a real implementation, you'd need to convert the image back to PHAsset
                        // or handle the image data directly
                    }
                }
            }
        }
    }
}

struct ImagePicker: UIViewControllerRepresentable {
    @Binding var selectedImage: PHAsset?
    @Environment(\.presentationMode) var presentationMode
    
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: ImagePicker
        
        init(_ parent: ImagePicker) {
            self.parent = parent
        }
        
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            parent.presentationMode.wrappedValue.dismiss()
            
            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else {
                return
            }
            
            // For simplicity, we'll just note that an image was selected
            // In a real app, you'd want to get the PHAsset for verification
            parent.selectedImage = nil // Placeholder
        }
    }
}
