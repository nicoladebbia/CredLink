package com.c2concierge.mobile.share

import android.content.Intent
import android.os.Bundle
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.c2concierge.mobile.C2CMobileVerifier
import com.c2concierge.mobile.SdkConfig
import com.c2concierge.mobile.ui.ResultsModal
import com.c2concierge.mobile.HttpUrl
import kotlinx.coroutines.launch

/**
 * Activity that handles shared content and shows verification results
 */
class ShareActivity : AppCompatActivity() {
    
    private lateinit var verifier: C2CMobileVerifier
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContentView(R.layout.activity_share)
        
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        
        // Initialize verifier
        val config = SdkConfig(
            relayBaseUrl = HttpUrl.parse("https://verify.c2concierge.org"),
            enableDebugLogging = BuildConfig.DEBUG
        )
        verifier = C2CMobileVerifier.create(this, config)
        
        // Handle shared content
        handleSharedContent()
    }
    
    private fun handleSharedContent() {
        val intent = intent ?: return
        val action = intent.action
        
        when (action) {
            Intent.ACTION_SEND -> handleSendIntent(intent)
            Intent.ACTION_VIEW -> handleViewIntent(intent)
            else -> {
                showError("Unsupported action: $action")
                finish()
            }
        }
    }
    
    private fun handleSendIntent(intent: Intent) {
        val type = intent.type
        
        when {
            type?.startsWith("image/") == true -> handleSharedImage(intent)
            type?.startsWith("video/") == true -> handleSharedVideo(intent)
            type == "text/plain" -> handleSharedText(intent)
            else -> {
                showError("Unsupported content type: $type")
                finish()
            }
        }
    }
    
    private fun handleViewIntent(intent: Intent) {
        val uri = intent.data
        
        if (uri != null) {
            statusText.text = "Verifying URL..."
            verifyUrl(uri.toString())
        } else {
            showError("No URL provided")
            finish()
        }
    }
    
    private fun handleSharedImage(intent: Intent) {
        statusText.text = "Processing image..."
        
        val uri = intent.getParcelableExtra<Intent.EXTRA_STREAM>(Intent.EXTRA_STREAM)
        if (uri != null) {
            statusText.text = "Verifying image..."
            verifyLocalUri(uri)
        } else {
            showError("No image provided")
            finish()
        }
    }
    
    private fun handleSharedVideo(intent: Intent) {
        statusText.text = "Processing video..."
        
        val uri = intent.getParcelableExtra<Intent.EXTRA_STREAM>(Intent.EXTRA_STREAM)
        if (uri != null) {
            statusText.text = "Verifying video..."
            verifyLocalUri(uri)
        } else {
            showError("No video provided")
            finish()
        }
    }
    
    private fun handleSharedText(intent: Intent) {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        
        if (text != null) {
            // Check if it's a URL
            if (text.startsWith("http://") || text.startsWith("https://")) {
                statusText.text = "Verifying URL..."
                verifyUrl(text)
            } else {
                showError("Text is not a URL: $text")
                finish()
            }
        } else {
            showError("No text provided")
            finish()
        }
    }
    
    private fun verifyUrl(urlString: String) {
        val httpUrl = HttpUrl.parse(urlString)
        
        if (httpUrl == null) {
            showError("Invalid URL: $urlString")
            finish()
            return
        }
        
        lifecycleScope.launch {
            try {
                val result = verifier.verify(httpUrl, preferRelay = true)
                hideProgress()
                ResultsModal.show(this@ShareActivity, result)
            } catch (e: Exception) {
                showError("Verification failed: ${e.message}")
                finish()
            }
        }
    }
    
    private fun verifyLocalUri(uri: android.net.Uri) {
        lifecycleScope.launch {
            try {
                val result = verifier.verify(uri)
                hideProgress()
                ResultsModal.show(this@ShareActivity, result)
            } catch (e: Exception) {
                showError("Verification failed: ${e.message}")
                finish()
            }
        }
    }
    
    private fun showProgress(message: String) {
        progressBar.visibility = ProgressBar.VISIBLE
        statusText.text = message
    }
    
    private fun hideProgress() {
        progressBar.visibility = ProgressBar.GONE
    }
    
    private fun showError(message: String) {
        statusText.text = "Error: $message"
        progressBar.visibility = ProgressBar.GONE
    }
}
