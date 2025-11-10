package com.credlink.mobile.sample

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.credlink.mobile.C2CMobileVerifier
import com.credlink.mobile.SdkConfig
import com.credlink.mobile.ui.ResultsModal
import com.credlink.mobile.HttpUrl
import kotlinx.coroutines.launch

/**
 * Sample Android app demonstrating C2 Concierge Mobile SDK integration
 */
class MainActivity : AppCompatActivity() {
    
    private lateinit var verifier: C2CMobileVerifier
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            showToast("Storage permission granted")
        } else {
            showToast("Storage permission denied")
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        setupUI()
        initializeSDK()
        checkPermissions()
    }
    
    private fun setupUI() {
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        
        // Button click listeners
        findViewById<Button>(R.id.selectPhotoButton).setOnClickListener {
            selectPhotoFromGallery()
        }
        
        findViewById<Button>(R.id.verifyUrlButton).setOnClickListener {
            showUrlInputDialog()
        }
        
        findViewById<Button>(R.id.verifySampleButton).setOnClickListener {
            verifySampleImage()
        }
        
        findViewById<Button>(R.id.shareTestButton).setOnClickListener {
            testShareFunctionality()
        }
    }
    
    private fun initializeSDK() {
        val config = SdkConfig(
            relayBaseUrl = HttpUrl.parse("https://verify.credlink.org"),
            pinnedSpki = listOf("relay_spki_hash_here"),
            enableDebugLogging = BuildConfig.DEBUG
        )
        
        verifier = C2CMobileVerifier.create(this, config)
        
        statusText.text = "C2 Concierge Mobile SDK initialized"
    }
    
    private fun checkPermissions() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.READ_EXTERNAL_STORAGE
            ) == PackageManager.PERMISSION_GRANTED -> {
                showToast("Storage permission already granted")
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
        }
    }
    
    private fun selectPhotoFromGallery() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        
        startActivityForResult(Intent.createChooser(intent, "Select Photo"), REQUEST_SELECT_PHOTO)
    }
    
    private fun showUrlInputDialog() {
        val builder = androidx.appcompat.app.AlertDialog.Builder(this)
        builder.setTitle("Verify URL")
        builder.setMessage("Enter image or video URL to verify")
        
        val input = android.widget.EditText(this)
        input.hint = "https://example.com/image.jpg"
        builder.setView(input)
        
        builder.setPositiveButton("Verify") { dialog, _ ->
            val url = input.text.toString()
            if (url.isNotBlank()) {
                verifyUrl(url)
            } else {
                showToast("Please enter a valid URL")
            }
        }
        
        builder.setNegativeButton("Cancel") { dialog, _ ->
            dialog.cancel()
        }
        
        builder.show()
    }
    
    private fun verifySampleImage() {
        val sampleUrl = "https://verify.credlink.org/sample/c2pa-image.jpg"
        verifyUrl(sampleUrl)
    }
    
    private fun testShareFunctionality() {
        val intent = Intent(this, ShareActivity::class.java).apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "https://verify.credlink.org/sample/c2pa-image.jpg")
        }
        
        startActivity(intent)
    }
    
    private fun verifyUrl(urlString: String) {
        val httpUrl = HttpUrl.parse(urlString)
        
        if (httpUrl == null) {
            showToast("Invalid URL: $urlString")
            return
        }
        
        showProgress("Verifying URL...")
        
        lifecycleScope.launch {
            try {
                val result = verifier.verify(httpUrl, preferRelay = true)
                hideProgress()
                ResultsModal.show(this@MainActivity, result)
            } catch (e: Exception) {
                hideProgress()
                showToast("Verification failed: ${e.message}")
            }
        }
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        when (requestCode) {
            REQUEST_SELECT_PHOTO -> {
                if (resultCode == RESULT_OK && data != null) {
                    val uri = data.data
                    if (uri != null) {
                        verifyLocalUri(uri)
                    }
                }
            }
        }
    }
    
    private fun verifyLocalUri(uri: android.net.Uri) {
        showProgress("Verifying local file...")
        
        lifecycleScope.launch {
            try {
                val result = verifier.verify(uri)
                hideProgress()
                ResultsModal.show(this@MainActivity, result)
            } catch (e: Exception) {
                hideProgress()
                showToast("Verification failed: ${e.message}")
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
    
    private fun showToast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
    
    companion object {
        private const val REQUEST_SELECT_PHOTO = 1001
    }
}
